import type { ApiRequest } from "../../shared/http/request-types.js";
import { badRequest } from "../../shared/errors/app-error.js";
import { BaseService } from "../../shared/services/base.service.js";
import {
  activeCompanyId,
  assertClientInCompany,
  assertShiftInCompany,
  assertTeamInCompany,
  assertUserInCompany
} from "../../shared/services/scope.service.js";
import { ActivitiesRepository } from "./activities.repository.js";

const publicUserSelect = {
  id: true,
  email: true,
  displayName: true,
  jobTitle: true,
  status: true
};

const activityInclude = {
  client: true,
  team: true,
  shift: true,
  assignee: { select: publicUserSelect },
  reporter: { select: publicUserSelect },
  comments: {
    where: { deletedAt: null },
    orderBy: { createdAt: "desc" },
    include: { author: { select: publicUserSelect }, attachments: true }
  },
  attachments: { where: { deletedAt: null }, orderBy: { createdAt: "desc" } },
  history: {
    orderBy: { createdAt: "desc" },
    include: { actor: { select: publicUserSelect } }
  }
};

export class ActivitiesService extends BaseService {
  private readonly activitiesRepository: ActivitiesRepository;

  constructor() {
    const repository = new ActivitiesRepository();
    super(repository, "Activity", { userStamps: true });
    this.activitiesRepository = repository;
  }

  override async list(req: ApiRequest) {
    return this.activitiesRepository.filteredList(this.activityWhere(req));
  }

  override async get(req: ApiRequest, id: string) {
    const item = await this.activitiesRepository.findById(
      id,
      this.companyId(req),
      activityInclude,
      true
    );
    if (!item) {
      return super.get(req, id);
    }
    return item;
  }

  override async create(req: ApiRequest, data: Record<string, unknown>) {
    await this.assertScopedReferences(req, data);
    const created = await super.create(req, {
      ...data,
      reporterId: data.reporterId ?? req.auth?.id
    });
    await this.history(req, String((created as { id: string }).id), "CREATED", {});
    return created;
  }

  override async update(req: ApiRequest, id: string, data: Record<string, unknown>) {
    const previous = (await this.get(req, id)) as { status?: string };
    await this.assertScopedReferences(req, data);
    if (data.status) {
      this.assertStatusTransition(previous.status, String(data.status));
    }
    const updated = await super.update(req, id, data);
    await this.history(req, id, "UPDATED", {
      metadata: { before: previous, after: updated }
    });
    return updated;
  }

  override async remove(req: ApiRequest, id: string) {
    const previous = await this.get(req, id);
    const removed = await super.remove(req, id);
    await this.history(req, id, "SOFT_DELETED", {
      note: "Soft deleted",
      metadata: { before: previous, after: removed, action: "SOFT_DELETE" }
    });
    return removed;
  }

  async move(req: ApiRequest, id: string, status: string, note?: string) {
    const previous = (await this.get(req, id)) as { status?: string; priority?: string };
    this.assertStatusTransition(previous.status, status);
    const updated = await super.update(req, id, {
      status,
      ...(status === "DONE" ? { completedAt: new Date() } : {}),
      ...(status === "IN_PROGRESS" ? { startedAt: new Date() } : {}),
      ...(status !== "DONE" ? { completedAt: null } : {})
    });
    await this.history(req, id, status === "DONE" ? "CLOSED" : "STATUS_CHANGED", {
      fromStatus: previous.status,
      toStatus: status,
      note
    });
    return updated;
  }

  async assign(req: ApiRequest, id: string, assigneeId: string | null, note?: string) {
    await assertUserInCompany(assigneeId, activeCompanyId(req));
    const updated = await super.update(req, id, { assigneeId });
    await this.history(req, id, assigneeId ? "ASSIGNED" : "UNASSIGNED", { note });
    return updated;
  }

  async close(req: ApiRequest, id: string) {
    return this.move(req, id, "DONE", "Closed from API");
  }

  async reopen(req: ApiRequest, id: string, note?: string) {
    const previous = (await this.get(req, id)) as { status?: string };
    if (previous.status !== "DONE" && previous.status !== "CANCELLED") {
      throw badRequest("Only completed or cancelled activities can be reopened");
    }
    const updated = await super.update(req, id, {
      status: "PENDING",
      completedAt: null,
      startedAt: null
    });
    await this.history(req, id, "REOPENED", {
      fromStatus: previous.status,
      toStatus: "PENDING",
      note: note ?? "Reopened from API"
    });
    return updated;
  }

  async kanban(req: ApiRequest) {
    return this.list(req);
  }

  private async history(
    req: ApiRequest,
    activityId: string,
    type: string,
    data: Record<string, unknown>
  ) {
    await this.activitiesRepository.addHistory({
      ...data,
      activityId,
      type,
      companyId: this.companyId(req),
      actorUserId: req.auth?.id
    });
  }

  private async assertScopedReferences(req: ApiRequest, data: Record<string, unknown>) {
    const companyId = activeCompanyId(req);
    await Promise.all([
      assertClientInCompany(data.clientId ? String(data.clientId) : undefined, companyId),
      assertTeamInCompany(data.teamId ? String(data.teamId) : undefined, companyId),
      assertShiftInCompany(data.shiftId ? String(data.shiftId) : undefined, companyId),
      assertUserInCompany(data.assigneeId ? String(data.assigneeId) : undefined, companyId),
      assertUserInCompany(data.reporterId ? String(data.reporterId) : req.auth?.id, companyId)
    ]);
  }

  private assertStatusTransition(from: string | undefined, to: string) {
    const allowed: Record<string, string[]> = {
      PENDING: [
        "IN_PROGRESS",
        "WAITING_CUSTOMER",
        "WAITING_THIRD_PARTY",
        "MONITORING",
        "DONE",
        "CANCELLED"
      ],
      IN_PROGRESS: [
        "PENDING",
        "WAITING_CUSTOMER",
        "WAITING_THIRD_PARTY",
        "MONITORING",
        "DONE",
        "CANCELLED"
      ],
      WAITING_CUSTOMER: ["PENDING", "IN_PROGRESS", "MONITORING", "DONE", "CANCELLED"],
      WAITING_THIRD_PARTY: ["PENDING", "IN_PROGRESS", "MONITORING", "DONE", "CANCELLED"],
      MONITORING: ["PENDING", "IN_PROGRESS", "DONE", "CANCELLED"],
      DONE: [],
      CANCELLED: []
    };
    if (from && from !== to && !(allowed[from] ?? []).includes(to)) {
      throw badRequest("Activity cannot move to the requested status from its current status");
    }
  }

  private activityWhere(req: ApiRequest) {
    const query = req.query as Record<string, unknown>;
    const search = query.search ? String(query.search).trim() : "";
    const uuidSearch =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(search);
    return {
      companyId: this.companyId(req),
      deletedAt: null,
      ...(query.clientId ? { clientId: String(query.clientId) } : {}),
      ...(query.teamId ? { teamId: String(query.teamId) } : {}),
      ...(query.shiftId ? { shiftId: String(query.shiftId) } : {}),
      ...(query.assigneeId ? { assigneeId: String(query.assigneeId) } : {}),
      ...(query.priority ? { priority: String(query.priority) } : {}),
      ...(query.status ? { status: String(query.status) } : {}),
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
}
