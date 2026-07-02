import { BaseRepository } from "../../shared/repositories/base.repository.js";
import { getDelegate } from "../../shared/lib/prisma.js";

type HistoryDelegate = {
  findMany(args: unknown): Promise<unknown[]>;
  create(args: unknown): Promise<unknown>;
};

type BoardColumnDelegate = {
  findMany(args: unknown): Promise<Array<{ id: string; name?: string; position: number }>>;
  findFirst(args: unknown): Promise<{ id: string; name?: string; position: number } | null>;
  create(args: unknown): Promise<unknown>;
  createMany(args: unknown): Promise<unknown>;
  update(args: unknown): Promise<unknown>;
  updateMany(args: unknown): Promise<unknown>;
};

type TaskDelegate = {
  findMany(args: unknown): Promise<Array<{ id: string; columnId: string; position: number }>>;
  findFirst(args: unknown): Promise<{
    id: string;
    columnId: string;
    position: number;
    archivedAt?: Date | null;
  } | null>;
  create(args: unknown): Promise<unknown>;
  update(args: unknown): Promise<unknown>;
  updateMany(args: unknown): Promise<unknown>;
};

const publicUserSelect = {
  id: true,
  email: true,
  displayName: true,
  jobTitle: true,
  status: true
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
        include: {
          client: true,
          team: true,
          shift: true,
          assignee: { select: publicUserSelect },
          reporter: { select: publicUserSelect }
        }
      }),
      delegate.count({ where })
    ]);
    return { items, total, page: 1, pageSize: 100 };
  }

  async addHistory(data: Record<string, unknown>) {
    return (await getDelegate<HistoryDelegate>("activityHistory")).create({ data });
  }

  async taskColumns() {
    return getDelegate<BoardColumnDelegate>("activityTaskColumn");
  }

  async tasks() {
    return getDelegate<TaskDelegate>("activityTask");
  }

  async taskHistory() {
    return getDelegate<HistoryDelegate>("activityTaskHistory");
  }
}
