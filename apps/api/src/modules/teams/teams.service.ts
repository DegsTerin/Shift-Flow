import type { ApiRequest } from "../../shared/http/request-types.js";
import { BaseService } from "../../shared/services/base.service.js";
import {
  activeCompanyId,
  assertTeamInCompany,
  assertUserInCompany
} from "../../shared/services/scope.service.js";
import { TeamsRepository } from "./teams.repository.js";

export class TeamsService extends BaseService {
  private readonly teamsRepository: TeamsRepository;

  constructor() {
    const repository = new TeamsRepository();
    super(repository, "Team", { userStamps: true });
    this.teamsRepository = repository;
  }

  async addMember(req: ApiRequest, teamId: string, data: Record<string, unknown>) {
    const companyId = activeCompanyId(req);
    await Promise.all([
      assertTeamInCompany(teamId, companyId),
      assertUserInCompany(String(data.userId), companyId)
    ]);
    return this.teamsRepository.addMember({
      ...data,
      teamId,
      companyId
    });
  }

  async removeMember(req: ApiRequest, teamId: string, userId: string) {
    const companyId = activeCompanyId(req);
    await Promise.all([
      assertTeamInCompany(teamId, companyId),
      assertUserInCompany(userId, companyId)
    ]);
    return this.teamsRepository.removeMember(companyId, teamId, userId);
  }
}
