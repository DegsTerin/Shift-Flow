import { getDelegate } from "../../shared/lib/prisma.js";

type ActivityDelegate = {
  count(args?: unknown): Promise<number>;
  groupBy(args: unknown): Promise<unknown[]>;
  findMany(args: unknown): Promise<unknown[]>;
};

const publicUserSelect = {
  id: true,
  email: true,
  displayName: true,
  jobTitle: true,
  status: true,
};

export class DashboardRepository {
  private async activities() {
    return getDelegate<ActivityDelegate>("activity");
  }

  async count(where: Record<string, unknown>) {
    return (await this.activities()).count({ where });
  }

  async groupBy(field: string, where: Record<string, unknown>) {
    return (await this.activities()).groupBy({
      by: [field],
      where,
      _count: { _all: true },
    });
  }

  async operationalList(where: Record<string, unknown>) {
    return (await this.activities()).findMany({
      where,
      take: 50,
      orderBy: [{ priority: "desc" }, { updatedAt: "desc" }],
      include: { client: true, team: true, assignee: { select: publicUserSelect }, shift: true },
    });
  }
}
