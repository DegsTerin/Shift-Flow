// en-GB: Encapsulates shifts persistence so data access remains consistent and testable.
import { BaseRepository } from "../../shared/repositories/base.repository.js";
import {
  getDelegate,
  getDelegateFrom,
  type PrismaTransactionClient
} from "../../shared/lib/prisma.js";
import { conflict } from "../../shared/errors/app-error.js";

export type ShiftStatus = "PLANNED" | "OPEN" | "CLOSED" | "REOPENED" | "CANCELLED";

type CoverageDelegate = {
  create(args: unknown): Promise<unknown>;
};

type ShiftDelegate = {
  update(args: unknown): Promise<unknown>;
};

function isRecordNotFoundError(cause: unknown) {
  return Boolean(
    cause && typeof cause === "object" && (cause as { code?: unknown }).code === "P2025"
  );
}

export class ShiftsRepository extends BaseRepository {
  constructor() {
    super("shift");
  }

  async addCoverage(data: Record<string, unknown>) {
    return (await getDelegate<CoverageDelegate>("shiftCoverage")).create({ data });
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
