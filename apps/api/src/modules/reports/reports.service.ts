import type { ApiRequest } from "../../shared/http/request-types.js";
import { badRequest } from "../../shared/errors/app-error.js";
import { BaseService } from "../../shared/services/base.service.js";
import {
  activeCompanyId,
  assertShiftInCompany,
  assertTeamInCompany,
  assertUserInCompany
} from "../../shared/services/scope.service.js";
import { ReportsRepository } from "./reports.repository.js";

export class ReportsService extends BaseService {
  private readonly reportsRepository: ReportsRepository;

  constructor() {
    const repository = new ReportsRepository();
    super(repository, "ShiftReport", {
      userStamps: false,
      orderBy: { createdAt: "desc" }
    });
    this.reportsRepository = repository;
  }

  override async create(req: ApiRequest, data: Record<string, unknown>) {
    const companyId = activeCompanyId(req);
    await Promise.all([
      assertShiftInCompany(String(data.shiftId), companyId),
      assertTeamInCompany(String(data.teamId), companyId),
      assertUserInCompany(req.auth?.id, companyId)
    ]);
    return super.create(req, { ...data, authorId: req.auth?.id });
  }

  override async update(req: ApiRequest, id: string, data: Record<string, unknown>) {
    const companyId = activeCompanyId(req);
    await Promise.all([
      assertShiftInCompany(data.shiftId ? String(data.shiftId) : undefined, companyId),
      assertTeamInCompany(data.teamId ? String(data.teamId) : undefined, companyId)
    ]);
    return super.update(req, id, data);
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
        ? {
            createdAt: {
              ...(query.from ? { gte: new Date(String(query.from)) } : {}),
              ...(query.to ? { lte: new Date(String(query.to)) } : {})
            }
          }
        : {})
    });
  }

  async submit(req: ApiRequest, id: string) {
    const current = (await this.get(req, id)) as { status?: string };
    if (current.status !== "DRAFT" && current.status !== "REJECTED") {
      throw badRequest("Only draft or rejected reports can be submitted");
    }
    return this.update(req, id, { status: "SUBMITTED", submittedAt: new Date() });
  }

  async approve(req: ApiRequest, id: string) {
    const companyId = activeCompanyId(req);
    await assertUserInCompany(req.auth?.id, companyId);
    const current = (await this.get(req, id)) as { status?: string };
    if (current.status !== "SUBMITTED") {
      throw badRequest("Only submitted reports can be approved");
    }
    return this.update(req, id, {
      status: "APPROVED",
      approvedAt: new Date(),
      approvedById: req.auth?.id
    });
  }
}
