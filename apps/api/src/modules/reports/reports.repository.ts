// en-GB: Encapsulates reports persistence so data access remains consistent and testable.
import { BaseRepository } from "../../shared/repositories/base.repository.js";
import {
  getDelegate,
  getDelegateFrom,
  type PrismaTransactionClient
} from "../../shared/lib/prisma.js";

type ActivityDelegate = {
  groupBy(args: unknown): Promise<unknown[]>;
  count(args: unknown): Promise<number>;
};

type ShiftReportDelegate = {
  updateMany(args: unknown): Promise<{ count: number }>;
  findFirst(args: unknown): Promise<unknown | null>;
};

type ReportLockClient = {
  $queryRawUnsafe<T>(query: string, ...values: unknown[]): Promise<T>;
};

export class ReportsRepository extends BaseRepository {
  constructor() {
    super("shiftReport");
  }

  async activitySummary(where: Record<string, unknown>) {
    const activity = await getDelegate<ActivityDelegate>("activity");
    const [byStatus, byPriority, total] = await Promise.all([
      activity.groupBy({ by: ["status"], where, _count: { _all: true } }),
      activity.groupBy({ by: ["priority"], where, _count: { _all: true } }),
      activity.count({ where })
    ]);
    return { total, byStatus, byPriority };
  }

  async findForUpdate(transaction: PrismaTransactionClient, id: string, companyId: string) {
    const client = transaction as ReportLockClient;
    // Read the audit preimage only after earlier mutations have released the report lock.
    const rows = await client.$queryRawUnsafe<Array<Record<string, unknown>>>(
      'SELECT * FROM "shift_reports" WHERE "id" = $1::uuid AND "companyId" = $2::uuid AND "deletedAt" IS NULL FOR UPDATE',
      id,
      companyId
    );
    return rows[0] ?? null;
  }

  async updateWhenStatus(
    transaction: PrismaTransactionClient,
    id: string,
    companyId: string,
    expectedStatuses: readonly string[],
    data: Record<string, unknown>
  ) {
    const report = getDelegateFrom<ShiftReportDelegate>(transaction, "shiftReport");
    const result = await report.updateMany({
      where: {
        id,
        companyId,
        deletedAt: null,
        status: { in: [...expectedStatuses] }
      },
      data
    });
    if (result.count !== 1) {
      return null;
    }

    return report.findFirst({ where: { id, companyId, deletedAt: null } });
  }
}
