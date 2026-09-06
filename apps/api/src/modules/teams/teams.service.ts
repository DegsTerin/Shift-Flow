// en-GB: Implements teams rules so invariants remain centralised outside the transport layer.
import type { ApiRequest } from "../../shared/http/request-types.js";
import { toBoundedSearch, toPagination, toSkipTake } from "../../shared/http/pagination.js";
import { notFound } from "../../shared/errors/app-error.js";
import { BaseService } from "../../shared/services/base.service.js";
import { activeCompanyId } from "../../shared/services/scope.service.js";
import { writeAudit } from "../../shared/services/audit-writer.js";
import { TeamsRepository } from "./teams.repository.js";

const teamInclude = {
  members: {
    where: { deletedAt: null },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          displayName: true,
          jobTitle: true,
          status: true
        }
      }
    },
    orderBy: { createdAt: "asc" }
  }
};

export class TeamsService extends BaseService {
  private readonly teamsRepository: TeamsRepository;

  constructor(
    repository = new TeamsRepository(),
    private readonly now: () => Date = () => new Date()
  ) {
    super(repository, "Team", { userStamps: true });
    this.teamsRepository = repository;
  }

  override async list(req: ApiRequest, filters: Record<string, unknown> = {}) {
    const pagination = toPagination(req.query);
    const companyId = this.requireCompanyId(req);
    const search = toBoundedSearch(req.query);
    const where = {
      ...filters,
      companyId,
      deletedAt: null,
      ...(search
        ? {
            OR: ["name", "description"].map((field) => ({
              [field]: { contains: search, mode: "insensitive" }
            }))
          }
        : {})
    };
    const [items, total] = await Promise.all([
      this.repository.list({
        where,
        ...toSkipTake(pagination),
        orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
        include: teamInclude
      }),
      this.repository.count(where)
    ]);

    return { items, total, ...pagination };
  }

  override async get(req: ApiRequest, id: string) {
    const item = await this.repository.findById(id, this.requireCompanyId(req), teamInclude);
    if (!item) {
      throw notFound("Team not found");
    }
    return item;
  }

  async addMember(req: ApiRequest, teamId: string, data: Record<string, unknown>) {
    const companyId = activeCompanyId(req);
    const memberData = {
      companyId,
      teamId,
      userId: String(data.userId),
      role: data.role ?? "MEMBER",
      ...(data.startsAt !== undefined ? { startsAt: data.startsAt } : {}),
      ...(data.endsAt !== undefined ? { endsAt: data.endsAt } : {})
    };
    return this.teamsRepository.withTransaction(async (_repository, transaction) => {
      const result = await this.teamsRepository.addMemberForUpdate(transaction, memberData);
      if (result.created) {
        await writeAudit(
          req,
          {
            entityType: "TeamMember",
            entityId: result.member.id,
            action: "CREATE",
            after: result.member,
            companyId,
            teamId
          },
          transaction
        );
      }
      return result.member;
    });
  }

  async removeMember(req: ApiRequest, teamId: string, userId: string) {
    const companyId = activeCompanyId(req);
    const deletedAt = this.now();
    return this.teamsRepository.withTransaction(async (_repository, transaction) => {
      const result = await this.teamsRepository.removeMembersForUpdate(
        transaction,
        companyId,
        teamId,
        userId,
        deletedAt
      );
      for (const change of result.changes) {
        await writeAudit(
          req,
          {
            entityType: "TeamMember",
            entityId: change.before.id,
            action: "SOFT_DELETE",
            before: change.before,
            after: change.after,
            companyId,
            teamId
          },
          transaction
        );
      }
      return { count: result.changes.length };
    });
  }
}
