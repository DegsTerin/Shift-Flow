import type { ApiRequest } from "../../shared/http/request-types.js";
import { BaseService } from "../../shared/services/base.service.js";
import { ActivitiesRepository } from "./activities.repository.js";

export class ActivitiesService extends BaseService {
  private readonly activitiesRepository: ActivitiesRepository;

  constructor() {
    const repository = new ActivitiesRepository();
    super(repository, "Activity", { userStamps: true });
    this.activitiesRepository = repository;
  }

  override async create(req: ApiRequest, data: Record<string, unknown>) {
    const created = await super.create(req, {
      ...data,
      reporterId: data.reporterId ?? req.auth?.id,
    });
    await this.history(req, String((created as { id: string }).id), "CREATED", {});
    return created;
  }

  async move(req: ApiRequest, id: string, status: string, note?: string) {
    const previous = (await this.get(req, id)) as { status?: string; priority?: string };
    const updated = await this.update(req, id, {
      status,
      ...(status === "DONE" ? { completedAt: new Date() } : {}),
      ...(status === "IN_PROGRESS" ? { startedAt: new Date() } : {}),
    });
    await this.history(req, id, "STATUS_CHANGED", {
      fromStatus: previous.status,
      toStatus: status,
      note,
    });
    return updated;
  }

  async assign(req: ApiRequest, id: string, assigneeId: string | null, note?: string) {
    const updated = await this.update(req, id, { assigneeId });
    await this.history(req, id, assigneeId ? "ASSIGNED" : "UNASSIGNED", { note });
    return updated;
  }

  async close(req: ApiRequest, id: string) {
    return this.move(req, id, "DONE", "Closed from API");
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
}
