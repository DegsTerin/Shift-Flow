import type { ApiRequest } from "../../shared/http/request-types.js";
import { badRequest } from "../../shared/errors/app-error.js";
import { BaseService } from "../../shared/services/base.service.js";
import { ShiftsRepository } from "./shifts.repository.js";

export class ShiftsService extends BaseService {
  private readonly shiftsRepository: ShiftsRepository;

  constructor() {
    const repository = new ShiftsRepository();
    super(repository, "Shift", { userStamps: true });
    this.shiftsRepository = repository;
  }

  override async create(req: ApiRequest, data: Record<string, unknown>) {
    this.assertPeriod(data.startsAt, data.endsAt);
    return super.create(req, data);
  }

  override async update(req: ApiRequest, id: string, data: Record<string, unknown>) {
    if (data.startsAt || data.endsAt) {
      const current = (await this.get(req, id)) as { startsAt?: Date; endsAt?: Date };
      this.assertPeriod(data.startsAt ?? current.startsAt, data.endsAt ?? current.endsAt);
    }
    return super.update(req, id, data);
  }

  async close(req: ApiRequest, id: string) {
    return this.update(req, id, { status: "CLOSED", closedAt: new Date() });
  }

  async reopen(req: ApiRequest, id: string) {
    return this.update(req, id, { status: "REOPENED", reopenedAt: new Date(), closedAt: null });
  }

  async addCoverage(req: ApiRequest, shiftId: string, data: Record<string, unknown>) {
    this.assertPeriod(data.startsAt, data.endsAt);
    return this.shiftsRepository.addCoverage({
      ...data,
      shiftId,
      companyId: this.companyId(req),
    });
  }

  private assertPeriod(startsAt: unknown, endsAt: unknown) {
    if (startsAt && endsAt && new Date(startsAt as Date).getTime() >= new Date(endsAt as Date).getTime()) {
      throw badRequest("endsAt must be after startsAt");
    }
  }
}
