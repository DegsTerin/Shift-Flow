// en-GB: Implements reports rules so invariants remain centralised outside the transport layer.
import type { ApiRequest } from "../../shared/http/request-types.js";
import { badRequest, notFound } from "../../shared/errors/app-error.js";
import { BaseService } from "../../shared/services/base.service.js";
import { writeAudit } from "../../shared/services/audit-writer.js";
import {
  activeCompanyId,
  assertShiftInCompany,
  assertTeamInCompany,
  assertUserInCompany
} from "../../shared/services/scope.service.js";
import { ReportsRepository } from "./reports.repository.js";

const editableFields = new Set(["shiftId", "teamId", "summary", "pendingNotes", "metrics"]);
const editableStatuses = ["DRAFT", "REJECTED"] as const;

type ReportRecord = {
  id?: string;
  status?: string;
  [key: string]: unknown;
};

export class ReportsService extends BaseService {
  private readonly reportsRepository: ReportsRepository;

  constructor(repository = new ReportsRepository()) {
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
    for (const field of Object.keys(data)) {
      if (!editableFields.has(field)) {
        throw badRequest(`Report field '${field}' cannot be changed through PATCH`);
      }
    }

    const companyId = activeCompanyId(req);
    await Promise.all([
      assertShiftInCompany(data.shiftId ? String(data.shiftId) : undefined, companyId),
      assertTeamInCompany(data.teamId ? String(data.teamId) : undefined, companyId)
    ]);
    return this.updateWithTransition(
      req,
      id,
      editableStatuses,
      data,
      "Only draft or rejected reports can be edited"
    );
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
              ...(query.from
                ? { gte: query.from instanceof Date ? query.from : new Date(String(query.from)) }
                : {}),
              ...(query.to
                ? { lte: query.to instanceof Date ? query.to : new Date(String(query.to)) }
                : {})
            }
          }
        : {})
    });
  }

  async submit(req: ApiRequest, id: string) {
    return this.updateWithTransition(
      req,
      id,
      editableStatuses,
      {
        status: "SUBMITTED",
        submittedAt: new Date(),
        approvedAt: null,
        approvedById: null
      },
      "Only draft or rejected reports can be submitted"
    );
  }

  async approve(req: ApiRequest, id: string) {
    const companyId = activeCompanyId(req);
    await assertUserInCompany(req.auth?.id, companyId);
    return this.updateWithTransition(
      req,
      id,
      ["SUBMITTED"],
      {
        status: "APPROVED",
        approvedAt: new Date(),
        approvedById: req.auth?.id
      },
      "Only submitted reports can be approved"
    );
  }

  async reject(req: ApiRequest, id: string) {
    const companyId = activeCompanyId(req);
    await assertUserInCompany(req.auth?.id, companyId);
    return this.updateWithTransition(
      req,
      id,
      ["SUBMITTED"],
      { status: "REJECTED", approvedAt: null, approvedById: null },
      "Only submitted reports can be rejected"
    );
  }

  private async updateWithTransition(
    req: ApiRequest,
    id: string,
    expectedStatuses: readonly string[],
    data: Record<string, unknown>,
    invalidTransitionMessage: string
  ) {
    const companyId = activeCompanyId(req);
    return this.reportsRepository.withTransaction(async (repository, transaction) => {
      const before = (await repository.findById(id, companyId)) as ReportRecord | null;
      if (!before) {
        throw notFound("ShiftReport not found");
      }
      if (!before.status || !expectedStatuses.includes(before.status)) {
        throw badRequest(invalidTransitionMessage);
      }

      const after = (await repository.updateWhenStatus(
        transaction,
        id,
        companyId,
        expectedStatuses,
        data
      )) as ReportRecord | null;
      if (!after) {
        throw badRequest("Report state changed before the command could be applied");
      }

      await writeAudit(
        req,
        {
          entityType: "ShiftReport",
          entityId: id,
          action: "UPDATE",
          before,
          after,
          companyId
        },
        transaction
      );
      return after;
    });
  }
}
