import { getDelegate } from "../../shared/lib/prisma.js";

type ActivityDelegate = {
  count(args?: unknown): Promise<number>;
  groupBy(args: unknown): Promise<unknown[]>;
  findMany(args: unknown): Promise<unknown[]>;
};

type DashboardConfigurationDelegate = {
  findFirst(args: unknown): Promise<Record<string, unknown> | null>;
  create(args: unknown): Promise<Record<string, unknown>>;
  update(args: unknown): Promise<Record<string, unknown>>;
};

type DashboardWidgetDelegate = {
  deleteMany(args: unknown): Promise<unknown>;
  createMany(args: unknown): Promise<unknown>;
};

const publicUserSelect = {
  id: true,
  email: true,
  displayName: true,
  jobTitle: true,
  status: true
};

export class DashboardRepository {
  private async activities() {
    return getDelegate<ActivityDelegate>("activity");
  }

  private async configurations() {
    return getDelegate<DashboardConfigurationDelegate>("dashboardConfiguration");
  }

  private async widgets() {
    return getDelegate<DashboardWidgetDelegate>("dashboardWidget");
  }

  async count(where: Record<string, unknown>) {
    return (await this.activities()).count({ where });
  }

  async groupBy(field: string, where: Record<string, unknown>) {
    return (await this.activities()).groupBy({
      by: [field],
      where,
      _count: { _all: true }
    });
  }

  async operationalList(where: Record<string, unknown>) {
    return (await this.activities()).findMany({
      where,
      take: 50,
      orderBy: [{ priority: "desc" }, { updatedAt: "desc" }],
      include: { client: true, team: true, assignee: { select: publicUserSelect }, shift: true }
    });
  }

  async findConfiguration(where: Record<string, unknown>) {
    return (await this.configurations()).findFirst({
      where,
      include: {
        widgets: {
          where: { deletedAt: null },
          orderBy: [{ order: "asc" }, { createdAt: "asc" }]
        }
      }
    });
  }

  async createConfiguration(data: Record<string, unknown>) {
    return (await this.configurations()).create({
      data,
      include: {
        widgets: {
          where: { deletedAt: null },
          orderBy: [{ order: "asc" }, { createdAt: "asc" }]
        }
      }
    });
  }

  async updateConfiguration(id: string, data: Record<string, unknown>) {
    return (await this.configurations()).update({
      where: { id },
      data,
      include: {
        widgets: {
          where: { deletedAt: null },
          orderBy: [{ order: "asc" }, { createdAt: "asc" }]
        }
      }
    });
  }

  async replaceWidgets(dashboardConfigId: string, companyId: string, widgets: Record<string, unknown>[]) {
    const widgetDelegate = await this.widgets();
    await widgetDelegate.deleteMany({ where: { dashboardConfigId, companyId } });
    if (widgets.length) {
      await widgetDelegate.createMany({ data: widgets });
    }
  }
}
