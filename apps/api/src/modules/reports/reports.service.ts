import type { ApiRequest } from "../../shared/http/request-types.js";
import { BaseService } from "../../shared/services/base.service.js";
import { ReportsRepository } from "./reports.repository.js";

export class ReportsService extends BaseService {
  private readonly reportsRepository: ReportsRepository;

  constructor() {
    const repository = new ReportsRepository();
    super(repository, "ShiftReport", {
      userStamps: false,
      orderBy: { createdAt: "desc" },
    });
    this.reportsRepository = repository;
  }

  override async create(req: ApiRequest, data: Record<string, unknown>) {
    return super.create(req, { ...data, authorId: req.auth?.id });
  }

  async activitySummary(req: ApiRequest) {
    const query = req.query as Record<string, unknown>;
    return this.reportsRepository.activitySummary({
      companyId: this.companyId(req),
      deletedAt: null,
      ...(query.teamId ? { teamId: query.teamId } : {}),
      ...(query.clientId ? { clientId: query.clientId } : {}),
      ...(query.shiftId ? { shiftId: query.shiftId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.from || query.to
        ? { createdAt: { ...(query.from ? { gte: query.from } : {}), ...(query.to ? { lte: query.to } : {}) } }
        : {}),
    });
  }

  async submit(req: ApiRequest, id: string) {
    return this.update(req, id, { status: "SUBMITTED", submittedAt: new Date() });
  }

  async approve(req: ApiRequest, id: string) {
    return this.update(req, id, {
      status: "APPROVED",
      approvedAt: new Date(),
      approvedById: req.auth?.id,
    });
  }
}
