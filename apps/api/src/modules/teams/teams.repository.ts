import { BaseRepository } from "../../shared/repositories/base.repository.js";
import { getDelegate } from "../../shared/lib/prisma.js";

type TeamMemberDelegate = {
  create(args: unknown): Promise<unknown>;
  updateMany(args: unknown): Promise<unknown>;
};

export class TeamsRepository extends BaseRepository {
  constructor() {
    super("team");
  }

  async addMember(data: Record<string, unknown>) {
    return (await getDelegate<TeamMemberDelegate>("teamMember")).create({ data });
  }

  async removeMember(companyId: string, teamId: string, userId: string) {
    return (await getDelegate<TeamMemberDelegate>("teamMember")).updateMany({
      where: { companyId, teamId, userId, deletedAt: null },
      data: { deletedAt: new Date() }
    });
  }
}
