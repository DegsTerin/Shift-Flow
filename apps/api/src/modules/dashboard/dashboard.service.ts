import type { ApiRequest } from "../../shared/http/request-types.js";
import { activeCompanyId } from "../../shared/services/scope.service.js";
import { DashboardRepository } from "./dashboard.repository.js";

export class DashboardService {
  constructor(private readonly repository = new DashboardRepository()) {}

  private countFromGroup(rows: unknown[], field: string, value: string) {
    const row = rows.find((item) => {
      const record = item as Record<string, unknown>;
      return record[field] === value;
    }) as { _count?: { _all?: number } } | undefined;
    return row?._count?._all ?? 0;
  }

  private where(req: ApiRequest) {
    const query = req.query as Record<string, unknown>;
    const search = query.search ? String(query.search).trim() : "";
    const uuidSearch =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(search);
    return {
      companyId: activeCompanyId(req),
      deletedAt: null,
      ...(query.teamId ? { teamId: query.teamId } : {}),
      ...(query.assigneeId ? { assigneeId: query.assigneeId } : {}),
      ...(query.clientId ? { clientId: query.clientId } : {}),
      ...(query.priority ? { priority: query.priority } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.shiftId ? { shiftId: query.shiftId } : {}),
      ...(query.from || query.to
        ? {
            createdAt: {
              ...(query.from ? { gte: new Date(String(query.from)) } : {}),
              ...(query.to ? { lte: new Date(String(query.to)) } : {})
            }
          }
        : {}),
      ...(search
        ? {
            OR: [
              ...(uuidSearch ? [{ id: search }] : []),
              { title: { contains: search, mode: "insensitive" } },
              { description: { contains: search, mode: "insensitive" } },
              { systemName: { contains: search, mode: "insensitive" } },
              { serviceName: { contains: search, mode: "insensitive" } },
              { client: { name: { contains: search, mode: "insensitive" } } },
              { team: { name: { contains: search, mode: "insensitive" } } },
              { assignee: { displayName: { contains: search, mode: "insensitive" } } },
              { assignee: { email: { contains: search, mode: "insensitive" } } }
            ]
          }
        : {})
    };
  }

  async summary(req: ApiRequest) {
    const where = this.where(req);
    const now = new Date();
    const [total, byStatus, byPriority, slaAtRisk] = await Promise.all([
      this.repository.count(where),
      this.repository.groupBy("status", where),
      this.repository.groupBy("priority", where),
      this.repository.count({
        ...where,
        status: { notIn: ["DONE", "CANCELLED"] },
        slaDueAt: { lte: new Date(now.getTime() + 60 * 60 * 1000) }
      })
    ]);
    const pending = this.countFromGroup(byStatus, "status", "PENDING");
    const inProgress = this.countFromGroup(byStatus, "status", "IN_PROGRESS");
    const done = this.countFromGroup(byStatus, "status", "DONE");
    const critical = this.countFromGroup(byPriority, "priority", "CRITICAL");

    return { total, pending, inProgress, done, critical, slaAtRisk };
  }

  async charts(req: ApiRequest) {
    const where = this.where(req);
    const [byTeam, byClient, byStatus, byPriority, byShift] = await Promise.all([
      this.repository.groupBy("teamId", where),
      this.repository.groupBy("clientId", where),
      this.repository.groupBy("status", where),
      this.repository.groupBy("priority", where),
      this.repository.groupBy("shiftId", where)
    ]);

    return { byTeam, byClient, byStatus, byPriority, byShift };
  }

  async operationalList(req: ApiRequest) {
    return this.repository.operationalList(this.where(req));
  }
}
