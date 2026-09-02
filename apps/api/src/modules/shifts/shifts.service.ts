// en-GB: Implements shifts rules so invariants remain centralised outside the transport layer.
import type { ApiRequest } from "../../shared/http/request-types.js";
import { badRequest, notFound } from "../../shared/errors/app-error.js";
import { BaseService } from "../../shared/services/base.service.js";
import { writeAudit } from "../../shared/services/audit-writer.js";
import {
  activeCompanyId,
  assertShiftInCompany,
  assertUserInCompany
} from "../../shared/services/scope.service.js";
import { ShiftsRepository, type ShiftStatus } from "./shifts.repository.js";

const lifecycleFields = ["status", "closedAt", "reopenedAt"] as const;
const closeableStatuses = new Set<ShiftStatus>(["PLANNED", "OPEN", "REOPENED"]);

type ShiftRecord = Record<string, unknown> & {
  id?: string;
  status?: ShiftStatus;
};

export class ShiftsService extends BaseService {
  private readonly shiftsRepository: ShiftsRepository;

  constructor(
    repository = new ShiftsRepository(),
    private readonly now: () => Date = () => new Date()
  ) {
    super(repository, "Shift", {
      userStamps: true,
      searchFields: ["name", "timezone"],
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }]
    });
    this.shiftsRepository = repository;
  }

  override async create(req: ApiRequest, data: Record<string, unknown>) {
    this.assertPeriod(data.startsAt, data.endsAt);
    return super.create(req, data);
  }

  override async update(req: ApiRequest, id: string, data: Record<string, unknown>) {
    if (lifecycleFields.some((field) => Object.prototype.hasOwnProperty.call(data, field))) {
      throw badRequest("Shift lifecycle fields require a dedicated command");
    }
    if (data.startsAt || data.endsAt) {
      const current = (await this.get(req, id)) as { startsAt?: Date; endsAt?: Date };
      this.assertPeriod(data.startsAt ?? current.startsAt, data.endsAt ?? current.endsAt);
    }
    return super.update(req, id, data);
  }

  async close(req: ApiRequest, id: string) {
    return this.transition(req, id, closeableStatuses, "CLOSED", {
      closedAt: this.now()
    });
  }

  async reopen(req: ApiRequest, id: string) {
    return this.transition(req, id, new Set<ShiftStatus>(["CLOSED"]), "REOPENED", {
      reopenedAt: this.now(),
      closedAt: null
    });
  }

  async addCoverage(req: ApiRequest, shiftId: string, data: Record<string, unknown>) {
    const companyId = activeCompanyId(req);
    this.assertPeriod(data.startsAt, data.endsAt);
    await Promise.all([
      assertShiftInCompany(shiftId, companyId),
      assertUserInCompany(String(data.userId), companyId),
      assertUserInCompany(
        data.replacementForUserId ? String(data.replacementForUserId) : undefined,
        companyId
      )
    ]);
    return this.shiftsRepository.addCoverage({
      ...data,
      shiftId,
      companyId
    });
  }

  private assertPeriod(startsAt: unknown, endsAt: unknown) {
    if (
      startsAt &&
      endsAt &&
      new Date(startsAt as Date).getTime() >= new Date(endsAt as Date).getTime()
    ) {
      throw badRequest("endsAt must be after startsAt");
    }
  }

  private async transition(
    req: ApiRequest,
    id: string,
    allowedStatuses: ReadonlySet<ShiftStatus>,
    nextStatus: ShiftStatus,
    timestamps: Record<string, unknown>
  ) {
    const companyId = activeCompanyId(req);
    return this.shiftsRepository.withTransaction(async (repository, transaction) => {
      const before = (await repository.findById(id, companyId)) as ShiftRecord | null;
      if (!before) {
        throw notFound("Shift not found");
      }
      if (!before.status || !allowedStatuses.has(before.status)) {
        throw badRequest(
          nextStatus === "CLOSED"
            ? "Shift cannot be closed from its current status"
            : "Only closed shifts can be reopened"
        );
      }

      const after = await repository.transitionStatus(transaction, id, companyId, before.status, {
        status: nextStatus,
        ...timestamps,
        updatedById: req.auth?.id
      });
      await writeAudit(
        req,
        {
          entityType: "Shift",
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
