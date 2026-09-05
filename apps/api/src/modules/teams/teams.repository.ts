// en-GB: Encapsulates teams persistence so data access remains consistent and testable.
import { BaseRepository } from "../../shared/repositories/base.repository.js";
import type { PrismaTransactionClient } from "../../shared/lib/prisma.js";
import { conflict, forbidden, notFound } from "../../shared/errors/app-error.js";

type TeamMemberDelegate = {
  create(args: unknown): Promise<unknown>;
  updateMany(args: unknown): Promise<{ count: number }>;
};

type TeamMemberMutationClient = {
  $queryRawUnsafe<T>(query: string, ...values: unknown[]): Promise<T>;
  teamMember: TeamMemberDelegate;
};

export type TeamMemberWriteResult = {
  member: Record<string, unknown> & { id: string };
  created: boolean;
};

export type TeamMemberRemovalResult = {
  changes: Array<{
    before: Record<string, unknown> & { id: string };
    after: Record<string, unknown> & { id: string };
  }>;
};

function canonicalUuid(value: string) {
  return value.toLowerCase();
}

export class TeamsRepository extends BaseRepository {
  constructor() {
    super("team");
  }

  async addMemberForUpdate(
    transaction: PrismaTransactionClient,
    data: Record<string, unknown>
  ): Promise<TeamMemberWriteResult> {
    const client = transaction as TeamMemberMutationClient;
    const companyId = canonicalUuid(String(data.companyId));
    const teamId = canonicalUuid(String(data.teamId));
    const userId = canonicalUuid(String(data.userId));
    await this.lockMembershipReferences(client, companyId, teamId, userId);
    const existing = await this.lockActiveMembers(client, companyId, teamId, userId, true);
    if (existing.length > 1) {
      throw conflict("Multiple active team memberships require data repair");
    }
    if (existing[0]) {
      return { member: existing[0], created: false };
    }

    const member = (await client.teamMember.create({
      data: { ...data, companyId, teamId, userId }
    })) as Record<string, unknown> & {
      id: string;
    };
    return { member, created: true };
  }

  async removeMembersForUpdate(
    transaction: PrismaTransactionClient,
    companyId: string,
    teamId: string,
    userId: string,
    deletedAt: Date
  ): Promise<TeamMemberRemovalResult> {
    const client = transaction as TeamMemberMutationClient;
    companyId = canonicalUuid(companyId);
    teamId = canonicalUuid(teamId);
    userId = canonicalUuid(userId);
    await this.lockMembershipReferences(client, companyId, teamId, userId);
    const members = await this.lockActiveMembers(client, companyId, teamId, userId, false);
    if (members.length === 0) {
      return { changes: [] };
    }

    const mutation = await client.teamMember.updateMany({
      where: {
        id: { in: members.map((member) => member.id) },
        companyId,
        teamId,
        userId,
        deletedAt: null
      },
      data: { deletedAt }
    });
    if (mutation.count !== members.length) {
      throw conflict("Team membership changed during removal");
    }
    return {
      changes: members.map((before) => ({
        before,
        after: { ...before, deletedAt }
      }))
    };
  }

  private async lockMembershipReferences(
    client: TeamMemberMutationClient,
    companyId: string,
    teamId: string,
    userId: string
  ) {
    const companies = await client.$queryRawUnsafe<Array<{ id: string }>>(
      'SELECT "id" FROM "companies" WHERE "id" = $1::uuid AND "status" = \'ACTIVE\' AND "deletedAt" IS NULL FOR SHARE',
      companyId
    );
    if (companies.length !== 1) {
      throw forbidden("The active company is unavailable");
    }

    const memberships = await client.$queryRawUnsafe<Array<{ id: string }>>(
      'SELECT u."id" FROM "users" AS u INNER JOIN "user_companies" AS uc ON uc."userId" = u."id" AND uc."companyId" = $2::uuid AND uc."deletedAt" IS NULL WHERE u."id" = $1::uuid AND u."status" = \'ACTIVE\' AND u."deletedAt" IS NULL FOR SHARE OF u, uc',
      userId,
      companyId
    );
    if (memberships.length !== 1) {
      throw forbidden("User does not belong to the active company");
    }

    const teams = await client.$queryRawUnsafe<Array<{ id: string }>>(
      'SELECT "id" FROM "teams" WHERE "id" = $1::uuid AND "companyId" = $2::uuid AND "deletedAt" IS NULL FOR UPDATE',
      teamId,
      companyId
    );
    if (teams.length !== 1) {
      throw notFound("Team not found in active company");
    }
  }

  private async lockActiveMembers(
    client: TeamMemberMutationClient,
    companyId: string,
    teamId: string,
    userId: string,
    limitToAmbiguity: boolean
  ) {
    const query = limitToAmbiguity
      ? 'SELECT * FROM "team_members" WHERE "companyId" = $1::uuid AND "teamId" = $2::uuid AND "userId" = $3::uuid AND "deletedAt" IS NULL ORDER BY "createdAt", "id" LIMIT 2 FOR UPDATE'
      : 'SELECT * FROM "team_members" WHERE "companyId" = $1::uuid AND "teamId" = $2::uuid AND "userId" = $3::uuid AND "deletedAt" IS NULL ORDER BY "createdAt", "id" FOR UPDATE';
    return client.$queryRawUnsafe<Array<Record<string, unknown> & { id: string }>>(
      query,
      companyId,
      teamId,
      userId
    );
  }
}
