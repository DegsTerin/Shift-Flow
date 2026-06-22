import type { ApiRequest } from "../../shared/http/request-types.js";
import { BaseService } from "../../shared/services/base.service.js";
import { ActivitiesRepository } from "./activities.repository.js";

const activityInclude = {
  client: true,
  team: true,
  shift: true,
  assignee: true,
  reporter: true,
  comments: {
    where: { deletedAt: null },
    orderBy: { createdAt: "desc" },
    include: { author: true, attachments: true },
  },
  attachments: { where: { deletedAt: null }, orderBy: { createdAt: "desc" } },
  history: {
    orderBy: { createdAt: "desc" },
    include: { actor: true },
  },
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
      true,
    );
    if (!item) {
      return super.get(req, id);
    }
    return item;
  }

  override async create(req: ApiRequest, data: Record<string, unknown>) {
    const created = await super.create(req, {
      ...data,
      reporterId: data.reporterId ?? req.auth?.id,
    });
    await this.history(req, String((created as { id: string }).id), "CREATED", {});
    return created;
  }

  override async update(req: ApiRequest, id: string, data: Record<string, unknown>) {
    const previous = await this.get(req, id);
    const updated = await super.update(req, id, data);
    await this.history(req, id, "UPDATED", {
      metadata: { before: previous, after: updated },
    });
    return updated;
  }

  override async remove(req: ApiRequest, id: string) {
    const previous = await this.get(req, id);
    const removed = await super.remove(req, id);
    await this.history(req, id, "SOFT_DELETED", {
      note: "Soft deleted",
      metadata: { before: previous, after: removed, action: "SOFT_DELETE" },
    });
    return removed;
  }

  async move(req: ApiRequest, id: string, status: string, note?: string) {
    const previous = (await this.get(req, id)) as { status?: string; priority?: string };
    const updated = await super.update(req, id, {
      status,
      ...(status === "DONE" ? { completedAt: new Date() } : {}),
      ...(status === "IN_PROGRESS" ? { startedAt: new Date() } : {}),
      ...(status !== "DONE" ? { completedAt: null } : {}),
    });
    await this.history(req, id, status === "DONE" ? "CLOSED" : "STATUS_CHANGED", {
      fromStatus: previous.status,
      toStatus: status,
      note,
    });
    return updated;
  }

  async assign(req: ApiRequest, id: string, assigneeId: string | null, note?: string) {
    const updated = await super.update(req, id, { assigneeId });
    await this.history(req, id, assigneeId ? "ASSIGNED" : "UNASSIGNED", { note });
    return updated;
  }

  async close(req: ApiRequest, id: string) {
    return this.move(req, id, "DONE", "Closed from API");
  }

  async reopen(req: ApiRequest, id: string, note?: string) {
    const previous = (await this.get(req, id)) as { status?: string };
    const updated = await super.update(req, id, {
      status: "PENDING",
      completedAt: null,
      startedAt: null,
    });
    await this.history(req, id, "REOPENED", {
      fromStatus: previous.status,
      toStatus: "PENDING",
      note: note ?? "Reopened from API",
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
    data: Record<string, unknown>,
  ) {
    await this.activitiesRepository.addHistory({
      ...data,
      activityId,
      type,
      companyId: this.companyId(req),
      actorUserId: req.auth?.id,
    });
  }

  private activityWhere(req: ApiRequest) {
    const query = req.query as Record<string, unknown>;
    const search = query.search ? String(query.search).trim() : "";
    const uuidSearch = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(search);
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
              ...(query.to ? { lte: new Date(String(query.to)) } : {}),
            },
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
              { assignee: { email: { contains: search, mode: "insensitive" } } },
            ],
          }
        : {}),
    };
  }
}
