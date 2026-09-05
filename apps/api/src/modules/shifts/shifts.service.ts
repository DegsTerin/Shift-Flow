// en-GB: Implements shifts rules so invariants remain centralised outside the transport layer.
import type { ApiRequest } from "../../shared/http/request-types.js";
import { badRequest, notFound } from "../../shared/errors/app-error.js";
import { BaseService } from "../../shared/services/base.service.js";
import { writeAudit } from "../../shared/services/audit-writer.js";
import { activeCompanyId } from "../../shared/services/scope.service.js";
import { loadCompanyTimezone } from "../../shared/services/date-range.service.js";
import {
  resolveZonedDatetime,
  timezoneSchema
} from "../../shared/services/zoned-datetime.service.js";
import { ShiftsRepository, type ShiftStatus } from "./shifts.repository.js";

const lifecycleFields = ["status", "closedAt", "reopenedAt"] as const;
const closeableStatuses = new Set<ShiftStatus>(["PLANNED", "OPEN", "REOPENED"]);
const transitionErrors: Record<ShiftStatus, string> = {
  PLANNED: "Shift cannot return to its initial status",
  OPEN: "Only planned shifts can be opened",
  CLOSED: "Shift cannot be closed from its current status",
  REOPENED: "Only closed shifts can be reopened",
  CANCELLED: "Shift cannot be cancelled from its current status"
};

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
    if (data.status !== undefined && data.status !== "PLANNED" && data.status !== "OPEN") {
      throw badRequest("New shifts must be planned or open");
    }
    if (["closedAt", "reopenedAt"].some((field) => Object.hasOwn(data, field))) {
      throw badRequest("Shift lifecycle timestamps require a dedicated command");
    }
    const timezone = this.validTimezone(
      data.timezone === undefined ? await loadCompanyTimezone(activeCompanyId(req)) : data.timezone
    );
    const startsAt = resolveZonedDatetime(data.startsAt, timezone);
    const endsAt = resolveZonedDatetime(data.endsAt, timezone);
    this.assertPeriod(startsAt, endsAt);
    return super.create(req, { ...data, timezone, startsAt, endsAt });
  }

  override async update(req: ApiRequest, id: string, data: Record<string, unknown>) {
    if (lifecycleFields.some((field) => Object.prototype.hasOwnProperty.call(data, field))) {
      throw badRequest("Shift lifecycle fields require a dedicated command");
    }
    const companyId = activeCompanyId(req);
    return this.shiftsRepository.withTransaction(async (repository, transaction) => {
      const before = await repository.findForUpdate(transaction, id, companyId);
      if (!before) throw notFound("Shift not found");
      const timezone = this.validTimezone(
        data.timezone === undefined ? before.timezone : data.timezone
      );
      const startsAt = resolveZonedDatetime(
        data.startsAt === undefined ? before.startsAt : data.startsAt,
        timezone
      );
      const endsAt = resolveZonedDatetime(
        data.endsAt === undefined ? before.endsAt : data.endsAt,
        timezone
      );
      this.assertPeriod(startsAt, endsAt);
      const after = await repository.update(
        id,
        {
          ...data,
          ...(data.startsAt === undefined ? {} : { startsAt }),
          ...(data.endsAt === undefined ? {} : { endsAt }),
          ...(data.timezone === undefined ? {} : { timezone }),
          updatedById: req.auth?.id
        },
        companyId
      );
      await writeAudit(
        req,
        { entityType: "Shift", entityId: id, action: "UPDATE", before, after, companyId },
        transaction
      );
      return after;
    });
  }

  private validTimezone(value: unknown) {
    const parsed = timezoneSchema.safeParse(value);
    if (!parsed.success) throw badRequest("Expected a valid IANA timezone");
    return parsed.data;
  }

  async close(req: ApiRequest, id: string) {
    return this.transition(req, id, closeableStatuses, "CLOSED", {
      closedAt: this.now()
    });
  }

  async open(req: ApiRequest, id: string) {
    return this.transition(req, id, new Set<ShiftStatus>(["PLANNED"]), "OPEN", {});
  }

  async cancel(req: ApiRequest, id: string) {
    return this.transition(req, id, closeableStatuses, "CANCELLED", {});
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
    const coverageData = {
      companyId,
      shiftId,
      userId: String(data.userId),
      replacementForUserId: data.replacementForUserId ? String(data.replacementForUserId) : null,
      type: data.type ?? "REGULAR",
      startsAt: data.startsAt,
      endsAt: data.endsAt,
      note: data.note ?? null
    };
    return this.shiftsRepository.withTransaction(async (_repository, transaction) => {
      const result = await this.shiftsRepository.addCoverageForUpdate(transaction, coverageData);
      if (result.created) {
        await writeAudit(
          req,
          {
            entityType: "ShiftCoverage",
            entityId: result.coverage.id,
            action: "CREATE",
            after: result.coverage,
            companyId,
            shiftId
          },
          transaction
        );
      }
      return result.coverage;
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
        throw badRequest(transitionErrors[nextStatus]);
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
