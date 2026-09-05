// en-GB: Encapsulates shifts persistence so data access remains consistent and testable.
import { BaseRepository } from "../../shared/repositories/base.repository.js";
import {
  getDelegateFrom,
  getPrisma,
  type PrismaTransactionClient
} from "../../shared/lib/prisma.js";
import { toSkipTake, type Pagination } from "../../shared/http/pagination.js";
import { conflict, forbidden, notFound } from "../../shared/errors/app-error.js";

export type ShiftStatus = "PLANNED" | "OPEN" | "CLOSED" | "REOPENED" | "CANCELLED";

type CoverageDelegate = {
  create(args: unknown): Promise<unknown>;
  findMany(args: unknown): Promise<Array<Record<string, unknown> & { id: string }>>;
};

type ShiftDelegate = {
  update(args: unknown): Promise<unknown>;
};

type CoverageReadClient = {
  shift: { findFirst(args: unknown): Promise<{ id: string } | null> };
  shiftCoverage: {
    findMany(args: unknown): Promise<unknown[]>;
    count(args: unknown): Promise<number>;
  };
};

type CoverageSnapshotClient = {
  $transaction<T>(
    operation: (transaction: CoverageReadClient) => Promise<T>,
    options?: { isolationLevel: "RepeatableRead" }
  ): Promise<T>;
};

const publicUserSelect = { id: true, email: true, displayName: true, jobTitle: true, status: true };

type CoverageMutationClient = {
  $queryRawUnsafe<T>(query: string, ...values: unknown[]): Promise<T>;
  shiftCoverage: CoverageDelegate;
};

export type CoverageWriteResult = {
  coverage: Record<string, unknown> & { id: string };
  created: boolean;
};

function isRecordNotFoundError(cause: unknown) {
  return Boolean(
    cause && typeof cause === "object" && (cause as { code?: unknown }).code === "P2025"
  );
}

function canonicalUuid(value: string) {
  return value.toLowerCase();
}

export class ShiftsRepository extends BaseRepository {
  constructor() {
    super("shift");
  }

  async listCoverages(companyId: string, shiftId: string, pagination: Pagination) {
    const prisma = (await getPrisma()) as CoverageSnapshotClient;
    // Parent visibility, rows and total must describe one tenant-qualified snapshot.
    return prisma.$transaction(
      async (transaction) => {
        const parent = await transaction.shift.findFirst({
          where: { id: shiftId, companyId, deletedAt: null },
          select: { id: true }
        });
        if (!parent) throw notFound("Shift not found");
        const where = { companyId, shiftId, deletedAt: null };
        const items = await transaction.shiftCoverage.findMany({
          where,
          ...toSkipTake(pagination),
          orderBy: [{ startsAt: "asc" }, { id: "asc" }],
          select: {
            id: true,
            shiftId: true,
            userId: true,
            replacementForUserId: true,
            type: true,
            startsAt: true,
            endsAt: true,
            note: true,
            user: { select: publicUserSelect },
            replacementForUser: { select: publicUserSelect }
          }
        });
        const total = await transaction.shiftCoverage.count({ where });
        return { items, total, ...pagination };
      },
      { isolationLevel: "RepeatableRead" }
    );
  }

  async findForUpdate(transaction: PrismaTransactionClient, id: string, companyId: string) {
    const client = transaction as CoverageMutationClient;
    const companies = await client.$queryRawUnsafe<Array<{ id: string }>>(
      'SELECT "id" FROM "companies" WHERE "id" = $1::uuid AND "status" = \'ACTIVE\' AND "deletedAt" IS NULL FOR SHARE',
      companyId
    );
    if (companies.length !== 1) throw forbidden("The active company is unavailable");
    // Lock before reading either bound so concurrent partial edits cannot validate stale pairs.
    const rows = await client.$queryRawUnsafe<Array<Record<string, unknown>>>(
      'SELECT * FROM "shifts" WHERE "id" = $1::uuid AND "companyId" = $2::uuid AND "deletedAt" IS NULL FOR UPDATE',
      id,
      companyId
    );
    return rows[0] ?? null;
  }

  async addCoverageForUpdate(
    transaction: PrismaTransactionClient,
    data: Record<string, unknown>
  ): Promise<CoverageWriteResult> {
    const client = transaction as CoverageMutationClient;
    const companyId = canonicalUuid(String(data.companyId));
    const shiftId = canonicalUuid(String(data.shiftId));
    const userId = canonicalUuid(String(data.userId));
    const replacementForUserId = data.replacementForUserId
      ? canonicalUuid(String(data.replacementForUserId))
      : null;
    const userIds = [
      ...new Set([userId, replacementForUserId].filter((id): id is string => Boolean(id)))
    ].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
    const normalisedData = {
      ...data,
      companyId,
      shiftId,
      userId,
      replacementForUserId
    };
    const companies = await client.$queryRawUnsafe<Array<{ id: string }>>(
      'SELECT "id" FROM "companies" WHERE "id" = $1::uuid AND "status" = \'ACTIVE\' AND "deletedAt" IS NULL FOR SHARE',
      companyId
    );
    if (companies.length !== 1) {
      throw forbidden("The active company is unavailable");
    }

    for (const userId of userIds) {
      const memberships = await client.$queryRawUnsafe<Array<{ id: string }>>(
        'SELECT u."id" FROM "users" AS u INNER JOIN "user_companies" AS uc ON uc."userId" = u."id" AND uc."companyId" = $2::uuid AND uc."deletedAt" IS NULL WHERE u."id" = $1::uuid AND u."status" = \'ACTIVE\' AND u."deletedAt" IS NULL FOR SHARE OF u, uc',
        userId,
        companyId
      );
      if (memberships.length !== 1) {
        throw forbidden("User does not belong to the active company");
      }
    }

    const shifts = await client.$queryRawUnsafe<Array<{ id: string }>>(
      'SELECT "id" FROM "shifts" WHERE "id" = $1::uuid AND "companyId" = $2::uuid AND "deletedAt" IS NULL FOR UPDATE',
      shiftId,
      companyId
    );
    if (shifts.length !== 1) {
      throw notFound("Shift not found in active company");
    }

    const duplicateWhere = {
      companyId,
      shiftId,
      userId,
      replacementForUserId,
      type: data.type,
      startsAt: data.startsAt,
      endsAt: data.endsAt,
      note: data.note ?? null,
      deletedAt: null
    };
    const existing = await client.shiftCoverage.findMany({
      where: duplicateWhere,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: 2
    });
    if (existing.length > 1) {
      throw conflict("Multiple active identical shift coverages require data repair");
    }
    if (existing[0]) {
      return { coverage: existing[0], created: false };
    }

    const coverage = (await client.shiftCoverage.create({ data: normalisedData })) as Record<
      string,
      unknown
    > & { id: string };
    return { coverage, created: true };
  }

  async transitionStatus(
    transaction: PrismaTransactionClient,
    id: string,
    companyId: string,
    expectedStatus: ShiftStatus,
    data: Record<string, unknown>
  ) {
    const shift = getDelegateFrom<ShiftDelegate>(transaction, "shift");
    try {
      return await shift.update({
        where: { id, companyId, deletedAt: null, status: expectedStatus },
        data
      });
    } catch (cause) {
      if (isRecordNotFoundError(cause)) {
        throw conflict("Shift status changed during transition");
      }
      throw cause;
    }
  }
}
