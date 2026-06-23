import { BaseRepository } from "../../shared/repositories/base.repository.js";
import { getDelegate } from "../../shared/lib/prisma.js";

type ActivityDelegate = {
  groupBy(args: unknown): Promise<unknown[]>;
  count(args: unknown): Promise<number>;
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
}
