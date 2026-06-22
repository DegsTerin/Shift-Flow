import type { ApiRequest } from "../../shared/http/request-types.js";
import { DashboardRepository } from "./dashboard.repository.js";

export class DashboardService {
  constructor(private readonly repository = new DashboardRepository()) {}

  private where(req: ApiRequest) {
    const query = req.query as Record<string, unknown>;
    return {
      companyId: req.tenant?.companyId ?? req.auth?.companyId,
      deletedAt: null,
      ...(query.teamId ? { teamId: query.teamId } : {}),
      ...(query.assigneeId ? { assigneeId: query.assigneeId } : {}),
      ...(query.clientId ? { clientId: query.clientId } : {}),
      ...(query.priority ? { priority: query.priority } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.shiftId ? { shiftId: query.shiftId } : {}),
    };
  }

  async summary(req: ApiRequest) {
    const where = this.where(req);
    const now = new Date();
    const [total, pending, inProgress, done, critical, slaAtRisk] = await Promise.all([
      this.repository.count(where),
      this.repository.count({ ...where, status: "PENDING" }),
      this.repository.count({ ...where, status: "IN_PROGRESS" }),
      this.repository.count({ ...where, status: "DONE" }),
      this.repository.count({ ...where, priority: "CRITICAL" }),
      this.repository.count({
        ...where,
        status: { notIn: ["DONE", "CANCELLED"] },
        slaDueAt: { lte: new Date(now.getTime() + 60 * 60 * 1000) },
      }),
    ]);

    return { total, pending, inProgress, done, critical, slaAtRisk };
  }

  async charts(req: ApiRequest) {
    const where = this.where(req);
    const [byTeam, byStatus, byPriority, byShift] = await Promise.all([
      this.repository.groupBy("teamId", where),
      this.repository.groupBy("status", where),
      this.repository.groupBy("priority", where),
      this.repository.groupBy("shiftId", where),
    ]);

    return { byTeam, byStatus, byPriority, byShift };
  }

  async operationalList(req: ApiRequest) {
    return this.repository.operationalList(this.where(req));
  }
}
