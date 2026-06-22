import type { ApiRequest } from "../../shared/http/request-types.js";
import { BaseService } from "../../shared/services/base.service.js";
import { TeamsRepository } from "./teams.repository.js";

export class TeamsService extends BaseService {
  private readonly teamsRepository: TeamsRepository;

  constructor() {
    const repository = new TeamsRepository();
    super(repository, "Team", { userStamps: true });
    this.teamsRepository = repository;
  }

  async addMember(req: ApiRequest, teamId: string, data: Record<string, unknown>) {
    return this.teamsRepository.addMember({
      ...data,
      teamId,
      companyId: this.companyId(req),
    });
  }

  async removeMember(req: ApiRequest, teamId: string, userId: string) {
    return this.teamsRepository.removeMember(String(this.companyId(req)), teamId, userId);
  }
}
