// en-GB: Verifies atomic, tenant-scoped and auditable team membership mutations.
import { describe, expect, it, vi } from "vitest";
import type { ApiRequest } from "../../shared/http/request-types.js";
import type { PrismaTransactionClient } from "../../shared/lib/prisma.js";
import { TeamsRepository } from "./teams.repository.js";
import { TeamsService } from "./teams.service.js";

function request(): ApiRequest {
  return {
    auth: { id: "actor-a", email: "actor@example.com", companyId: "company-a" },
    context: { requestId: "request-a", ipAddress: "127.0.0.1", userAgent: "vitest" },
    tenant: { companyId: "company-a" },
    query: {}
  } as unknown as ApiRequest;
}

type TeamHarnessOptions = {
  company?: boolean;
  companyStatus?: string;
  companyDeleted?: boolean;
  membership?: boolean;
  userStatus?: string;
  userDeleted?: boolean;
  team?: boolean;
  teamCompanyId?: string;
  teamDeleted?: boolean;
  memberResponses?: Array<Array<Record<string, unknown> & { id: string }>>;
  updateCounts?: number[];
};

function teamHarness(options: TeamHarnessOptions = {}) {
  let memberRead = 0;
  const query = vi.fn(async (statement: string, ...values: unknown[]) => {
    if (statement.includes('FROM "companies"')) {
      const visible =
        options.company !== false &&
        values[0] === "company-a" &&
        (!statement.includes("\"status\" = 'ACTIVE'") ||
          (options.companyStatus ?? "ACTIVE") === "ACTIVE") &&
        (!statement.includes('"deletedAt" IS NULL') || !options.companyDeleted);
      return visible ? [{ id: "company-a" }] : [];
    }
    if (statement.includes('FROM "users"')) {
      const visible =
        values[0] === "user-a" &&
        values[1] === "company-a" &&
        (!statement.includes('uc."deletedAt" IS NULL') || options.membership !== false) &&
        (!statement.includes("u.\"status\" = 'ACTIVE'") ||
          (options.userStatus ?? "ACTIVE") === "ACTIVE") &&
        (!statement.includes('u."deletedAt" IS NULL') || !options.userDeleted);
      return visible ? [{ id: "user-a" }] : [];
    }
    if (statement.includes('FROM "teams"')) {
      const visible =
        options.team !== false &&
        values[0] === "team-a" &&
        (!statement.includes('"companyId" = $2::uuid') ||
          (options.teamCompanyId ?? "company-a") === values[1]) &&
        (!statement.includes('"deletedAt" IS NULL') || !options.teamDeleted);
      return visible ? [{ id: "team-a" }] : [];
    }
    if (statement.includes('FROM "team_members"')) {
      return options.memberResponses?.[memberRead++] ?? [];
    }
    throw new Error(`Unexpected SQL in team membership test: ${statement}`);
  });
  const create = vi.fn().mockResolvedValue({ id: "member-a" });
  const updateMany = vi.fn();
  for (const count of options.updateCounts ?? []) {
    updateMany.mockResolvedValueOnce({ count });
  }
  const transaction = {
    $queryRawUnsafe: query,
    teamMember: { create, updateMany }
  } as unknown as PrismaTransactionClient;
  return { query, create, updateMany, transaction };
}

describe("TeamsRepository membership mutation", () => {
  it("locks active references and member rows in deterministic order before creation", async () => {
    const state = teamHarness();
    const data = {
      companyId: "company-a",
      teamId: "team-a",
      userId: "user-a",
      role: "MEMBER"
    };

    await expect(
      new TeamsRepository().addMemberForUpdate(state.transaction, data)
    ).resolves.toEqual({ member: { id: "member-a" }, created: true });

    const statements = state.query.mock.calls.map((call) => String(call[0]));
    expect(statements).toHaveLength(4);
    expect(statements[0]).toContain('FROM "companies"');
    expect(statements[0]).toContain("\"status\" = 'ACTIVE'");
    expect(statements[0]).toContain('"deletedAt" IS NULL');
    expect(statements[0]).toContain("FOR SHARE");
    expect(statements[1]).toContain('INNER JOIN "user_companies"');
    expect(statements[1]).toContain("u.\"status\" = 'ACTIVE'");
    expect(statements[1]).toContain('uc."deletedAt" IS NULL');
    expect(statements[1]).toContain('u."deletedAt" IS NULL');
    expect(statements[1]).toContain("FOR SHARE OF u, uc");
    expect(statements[2]).toContain('FROM "teams"');
    expect(statements[2]).toContain('"companyId" = $2::uuid');
    expect(statements[2]).toContain('"deletedAt" IS NULL');
    expect(statements[2]).toContain("FOR UPDATE");
    expect(statements[3]).toContain('FROM "team_members"');
    expect(statements[3]).toContain('"deletedAt" IS NULL');
    expect(statements[3]).toContain('ORDER BY "createdAt", "id"');
    expect(statements[3]).toContain("LIMIT 2 FOR UPDATE");
    expect(state.query.mock.calls[3]?.slice(1)).toEqual(["company-a", "team-a", "user-a"]);
    expect(state.query.mock.invocationCallOrder[3]).toBeLessThan(
      state.create.mock.invocationCallOrder[0]
    );
    expect(state.create).toHaveBeenCalledWith({ data });
  });

  it("returns one locked active duplicate and rejects ambiguous duplicates", async () => {
    const member = { id: "member-a" };
    const repository = new TeamsRepository();
    const one = teamHarness({ memberResponses: [[member]] });
    const many = teamHarness({ memberResponses: [[member, { id: "member-b" }]] });
    const data = {
      companyId: "company-a",
      teamId: "team-a",
      userId: "user-a",
      role: "MEMBER"
    };

    await expect(repository.addMemberForUpdate(one.transaction, data)).resolves.toEqual({
      member,
      created: false
    });
    await expect(repository.addMemberForUpdate(many.transaction, data)).rejects.toMatchObject({
      code: "CONFLICT",
      statusCode: 409
    });
    expect(one.create).not.toHaveBeenCalled();
    expect(many.create).not.toHaveBeenCalled();
  });

  it.each([
    [{ company: false }, "FORBIDDEN", 403, "active company", 1],
    [{ membership: false }, "FORBIDDEN", 403, "User does not belong", 2],
    [{ team: false }, "NOT_FOUND", 404, "Team not found", 3]
  ] as const)(
    "fails closed when a locked reference is unavailable",
    async (options, code, statusCode, message, queryCount) => {
      const state = teamHarness(options);

      await expect(
        new TeamsRepository().addMemberForUpdate(state.transaction, {
          companyId: "company-a",
          teamId: "team-a",
          userId: "user-a"
        })
      ).rejects.toMatchObject({ code, statusCode, message: expect.stringContaining(message) });
      expect(state.query).toHaveBeenCalledTimes(queryCount);
      expect(state.create).not.toHaveBeenCalled();
    }
  );

  it("removes every locked active duplicate by id and rejects a changed mutation count", async () => {
    const deletedAt = new Date("2026-09-02T12:00:00.000Z");
    const members = [{ id: "member-a" }, { id: "member-b" }];
    const repository = new TeamsRepository();
    const success = teamHarness({ memberResponses: [members], updateCounts: [2] });
    const changed = teamHarness({ memberResponses: [members], updateCounts: [1] });

    await expect(
      repository.removeMembersForUpdate(
        success.transaction,
        "company-a",
        "team-a",
        "user-a",
        deletedAt
      )
    ).resolves.toEqual({
      changes: members.map((before) => ({ before, after: { ...before, deletedAt } }))
    });
    expect(String(success.query.mock.calls[2]?.[0])).toContain("FOR UPDATE");
    expect(String(success.query.mock.calls[2]?.[0])).not.toContain("LIMIT 2");
    expect(success.updateMany).toHaveBeenCalledWith({
      where: {
        id: { in: ["member-a", "member-b"] },
        companyId: "company-a",
        teamId: "team-a",
        userId: "user-a",
        deletedAt: null
      },
      data: { deletedAt }
    });

    await expect(
      repository.removeMembersForUpdate(
        changed.transaction,
        "company-a",
        "team-a",
        "user-a",
        deletedAt
      )
    ).rejects.toMatchObject({ code: "CONFLICT", statusCode: 409 });
  });

  it("returns a no-op when no active membership remains", async () => {
    const state = teamHarness({ memberResponses: [[]] });
    await expect(
      new TeamsRepository().removeMembersForUpdate(
        state.transaction,
        "company-a",
        "team-a",
        "user-a",
        new Date()
      )
    ).resolves.toEqual({ changes: [] });
    expect(state.updateMany).not.toHaveBeenCalled();
  });

  it.each([
    ["invited user", { userStatus: "INVITED" }],
    ["inactive user", { userStatus: "INACTIVE" }],
    ["locked user", { userStatus: "LOCKED" }],
    ["deleted user", { userDeleted: true }],
    ["ended company membership", { membership: false }]
  ] as const)(
    "removes a historical membership for an %s but still rejects addition",
    async (_label, options) => {
      const before = {
        id: "member-a",
        companyId: "company-a",
        teamId: "team-a",
        userId: "user-a",
        deletedAt: null
      };
      const deletedAt = new Date("2026-09-03T10:00:00.123Z");
      const removal = teamHarness({ ...options, memberResponses: [[before]], updateCounts: [1] });
      const addition = teamHarness(options);
      const repository = new TeamsRepository();

      await expect(
        repository.removeMembersForUpdate(
          removal.transaction,
          "COMPANY-A",
          "TEAM-A",
          "USER-A",
          deletedAt
        )
      ).resolves.toEqual({
        changes: [{ before, after: { ...before, deletedAt } }]
      });
      expect(removal.query).toHaveBeenCalledTimes(3);
      const statements = removal.query.mock.calls.map((call) => call[0]);
      expect(statements[0]).toContain('FROM "companies"');
      expect(statements[0]).toContain("\"status\" = 'ACTIVE'");
      expect(statements[0]).toContain('"deletedAt" IS NULL FOR SHARE');
      expect(statements[1]).toContain('FROM "teams"');
      expect(statements[1]).toContain(
        '"id" = $1::uuid AND "companyId" = $2::uuid AND "deletedAt" IS NULL FOR UPDATE'
      );
      expect(statements[2]).toContain('FROM "team_members"');
      expect(statements[2]).toContain(
        '"companyId" = $1::uuid AND "teamId" = $2::uuid AND "userId" = $3::uuid AND "deletedAt" IS NULL'
      );
      expect(statements[2]).toContain('ORDER BY "createdAt", "id" FOR UPDATE');
      expect(statements.join("\n")).not.toContain('FROM "users"');
      expect(removal.query.mock.calls.map((call) => call.slice(1))).toEqual([
        ["company-a"],
        ["team-a", "company-a"],
        ["company-a", "team-a", "user-a"]
      ]);
      expect(removal.query.mock.invocationCallOrder[2]).toBeLessThan(
        removal.updateMany.mock.invocationCallOrder[0]
      );

      await expect(
        repository.addMemberForUpdate(addition.transaction, {
          companyId: "company-a",
          teamId: "team-a",
          userId: "user-a"
        })
      ).rejects.toMatchObject({ code: "FORBIDDEN", statusCode: 403 });
      expect(addition.query).toHaveBeenCalledTimes(2);
      expect(addition.create).not.toHaveBeenCalled();
      expect(addition.updateMany).not.toHaveBeenCalled();
    }
  );

  it.each([
    [{ company: false }, "company-a", "FORBIDDEN", 1],
    [{ companyStatus: "INACTIVE" }, "company-a", "FORBIDDEN", 1],
    [{ companyStatus: "SUSPENDED" }, "company-a", "FORBIDDEN", 1],
    [{ companyDeleted: true }, "company-a", "FORBIDDEN", 1],
    [{}, "company-b", "FORBIDDEN", 1],
    [{ team: false }, "company-a", "NOT_FOUND", 2],
    [{ teamDeleted: true }, "company-a", "NOT_FOUND", 2],
    [{ teamCompanyId: "company-b" }, "company-a", "NOT_FOUND", 2]
  ] as const)(
    "rejects removal when its company or team reference is unavailable",
    async (options, companyId, code, queryCount) => {
      const state = teamHarness(options);
      await expect(
        new TeamsRepository().removeMembersForUpdate(
          state.transaction,
          companyId,
          "team-a",
          "user-a",
          new Date()
        )
      ).rejects.toMatchObject({ code });
      expect(state.query).toHaveBeenCalledTimes(queryCount);
      expect(state.updateMany).not.toHaveBeenCalled();
      expect(state.create).not.toHaveBeenCalled();
    }
  );
});

describe("TeamsService membership audit", () => {
  it("leaves a zero-count removal audit-free", async () => {
    const auditCreate = vi.fn();
    const transaction = { auditLog: { create: auditCreate } } as PrismaTransactionClient;
    const repository = new TeamsRepository();
    vi.spyOn(repository, "removeMembersForUpdate").mockResolvedValue({ changes: [] });
    vi.spyOn(repository, "withTransaction").mockImplementation(
      async <T>(
        operation: (value: TeamsRepository, transaction: PrismaTransactionClient) => Promise<T>
      ) => operation(repository, transaction)
    );
    await expect(
      new TeamsService(repository).removeMember(request(), "team-a", "user-a")
    ).resolves.toEqual({ count: 0 });
    expect(auditCreate).not.toHaveBeenCalled();
  });

  it("audits a created member and leaves an existing member audit-free", async () => {
    const auditCreate = vi.fn().mockResolvedValue({ id: "audit-a" });
    const transaction = { auditLog: { create: auditCreate } } as PrismaTransactionClient;
    const member = { id: "member-a", companyId: "company-a", teamId: "team-a" };
    const repository = new TeamsRepository();
    const addMemberForUpdate = vi
      .spyOn(repository, "addMemberForUpdate")
      .mockResolvedValueOnce({ member, created: true })
      .mockResolvedValueOnce({ member, created: false });
    const withTransaction = vi
      .spyOn(repository, "withTransaction")
      .mockImplementation(
        async <T>(
          operation: (
            value: TeamsRepository,
            valueTransaction: PrismaTransactionClient
          ) => Promise<T>
        ) => operation(repository, transaction)
      );
    const service = new TeamsService(repository);

    await service.addMember(request(), "team-a", { userId: "user-a" });
    await service.addMember(request(), "team-a", { userId: "user-a" });

    expect(withTransaction).toHaveBeenCalledTimes(2);
    expect(addMemberForUpdate).toHaveBeenCalledWith(
      transaction,
      expect.objectContaining({ companyId: "company-a", teamId: "team-a", userId: "user-a" })
    );
    expect(auditCreate).toHaveBeenCalledOnce();
    expect(auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "CREATE",
        entityType: "TeamMember",
        entityId: "member-a",
        actorUserId: "actor-a",
        companyId: "company-a",
        teamId: "team-a"
      })
    });
  });

  it("uses one timestamp and audits every soft-deleted membership", async () => {
    const deletedAt = new Date("2026-09-02T12:00:00.000Z");
    const auditCreate = vi.fn().mockResolvedValue({ id: "audit-a" });
    const transaction = { auditLog: { create: auditCreate } } as PrismaTransactionClient;
    const changes = [
      { before: { id: "member-a" }, after: { id: "member-a", deletedAt } },
      { before: { id: "member-b" }, after: { id: "member-b", deletedAt } }
    ];
    const repository = new TeamsRepository();
    const removeMembersForUpdate = vi
      .spyOn(repository, "removeMembersForUpdate")
      .mockResolvedValue({ changes });
    const withTransaction = vi
      .spyOn(repository, "withTransaction")
      .mockImplementation(
        async <T>(
          operation: (
            value: TeamsRepository,
            valueTransaction: PrismaTransactionClient
          ) => Promise<T>
        ) => operation(repository, transaction)
      );
    const service = new TeamsService(repository, () => deletedAt);

    await expect(service.removeMember(request(), "team-a", "user-a")).resolves.toEqual({
      count: 2
    });

    expect(withTransaction).toHaveBeenCalledOnce();
    expect(removeMembersForUpdate).toHaveBeenCalledWith(
      transaction,
      "company-a",
      "team-a",
      "user-a",
      deletedAt
    );
    expect(auditCreate).toHaveBeenCalledTimes(2);
    for (const call of auditCreate.mock.calls) {
      expect(call[0]).toEqual({
        data: expect.objectContaining({
          action: "SOFT_DELETE",
          entityType: "TeamMember",
          actorUserId: "actor-a",
          after: expect.objectContaining({ deletedAt })
        })
      });
    }
  });

  it("propagates audit failures from creation and multi-removal", async () => {
    const auditFailure = new Error("audit unavailable");
    const createAudit = vi.fn().mockRejectedValue(auditFailure);
    const createTransaction = { auditLog: { create: createAudit } } as PrismaTransactionClient;
    const createRepository = new TeamsRepository();
    vi.spyOn(createRepository, "addMemberForUpdate").mockResolvedValue({
      member: { id: "member-a" },
      created: true
    });
    vi.spyOn(createRepository, "withTransaction").mockImplementation(
      async <T>(
        operation: (value: TeamsRepository, transaction: PrismaTransactionClient) => Promise<T>
      ) => operation(createRepository, createTransaction)
    );

    await expect(
      new TeamsService(createRepository).addMember(request(), "team-a", { userId: "user-a" })
    ).rejects.toBe(auditFailure);

    const removeAudit = vi
      .fn()
      .mockResolvedValueOnce({ id: "audit-a" })
      .mockRejectedValueOnce(auditFailure);
    const removeTransaction = { auditLog: { create: removeAudit } } as PrismaTransactionClient;
    const removeRepository = new TeamsRepository();
    vi.spyOn(removeRepository, "removeMembersForUpdate").mockResolvedValue({
      changes: [
        { before: { id: "member-a" }, after: { id: "member-a", deletedAt: new Date() } },
        { before: { id: "member-b" }, after: { id: "member-b", deletedAt: new Date() } }
      ]
    });
    vi.spyOn(removeRepository, "withTransaction").mockImplementation(
      async <T>(
        operation: (value: TeamsRepository, transaction: PrismaTransactionClient) => Promise<T>
      ) => operation(removeRepository, removeTransaction)
    );

    await expect(
      new TeamsService(removeRepository).removeMember(request(), "team-a", "user-a")
    ).rejects.toBe(auditFailure);
    expect(removeAudit).toHaveBeenCalledTimes(2);
  });
});
