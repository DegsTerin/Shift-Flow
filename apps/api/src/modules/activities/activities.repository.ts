import { BaseRepository } from "../../shared/repositories/base.repository.js";
import { getDelegate } from "../../shared/lib/prisma.js";

type HistoryDelegate = {
  create(args: unknown): Promise<unknown>;
};

export class ActivitiesRepository extends BaseRepository {
  constructor() {
    super("activity");
  }

  async filteredList(where: Record<string, unknown>) {
    const delegate = await getDelegate<{
      findMany(args: unknown): Promise<unknown[]>;
      count(args: unknown): Promise<number>;
    }>("activity");
    const [items, total] = await Promise.all([
      delegate.findMany({
        where,
        take: 100,
        orderBy: [{ priority: "desc" }, { updatedAt: "desc" }],
        include: { client: true, team: true, shift: true, assignee: true, reporter: true },
      }),
      delegate.count({ where }),
    ]);
    return { items, total, page: 1, pageSize: 100 };
  }

  async addHistory(data: Record<string, unknown>) {
    return (await getDelegate<HistoryDelegate>("activityHistory")).create({ data });
  }
}
