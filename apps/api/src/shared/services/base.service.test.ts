// en-GB: Verifies search composition and atomic audited writes without weakening tenant scope.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiRequest } from "../http/request-types.js";
import { BaseRepository } from "../repositories/base.repository.js";
import { BaseService } from "./base.service.js";

const persistence = vi.hoisted(() => ({
  getDelegate: vi.fn(),
  transaction: vi.fn()
}));

vi.mock("../lib/prisma.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/prisma.js")>()),
  getDelegate: persistence.getDelegate,
  withPrismaTransaction: persistence.transaction
}));

type StoredResource = {
  id: string;
  companyId: string;
  name: string;
  deletedAt: Date | null;
  [field: string]: unknown;
};

function request(): ApiRequest {
  return {
    auth: { id: "user-a", email: "user@example.com", companyId: "company-a" },
    tenant: { companyId: "company-a" },
    context: {
      requestId: "request-a",
      ipAddress: "127.0.0.1",
      userAgent: "unit-test"
    },
    query: {}
  } as unknown as ApiRequest;
}

function transactionalStore(initial?: StoredResource) {
  let committed = initial ? { ...initial } : null;
  let staged: StoredResource | null = null;
  let stagedAudit: Array<Record<string, unknown>> = [];
  const auditRows: Array<Record<string, unknown>> = [];
  let auditFailure: Error | undefined;

  const matches = (where: Record<string, unknown>) =>
    staged !== null &&
    staged.id === where.id &&
    (where.companyId === undefined || staged.companyId === where.companyId) &&
    (where.deletedAt === undefined || staged.deletedAt === where.deletedAt);

  const findFirst = vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
    matches(where) && staged ? { ...staged } : null
  );
  const create = vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
    staged = {
      id: "resource-a",
      deletedAt: null,
      ...data
    } as StoredResource;
    return { ...staged };
  });
  const update = vi.fn(
    async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
      if (!matches(where) || !staged) {
        throw Object.assign(new Error("resource not found"), { code: "P2025" });
      }
      staged = { ...staged, ...data };
      return { ...staged };
    }
  );
  const auditCreate = vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
    if (auditFailure) {
      throw auditFailure;
    }
    stagedAudit.push(data);
    return data;
  });
  const transaction = async (operation: (client: Record<string, unknown>) => Promise<unknown>) => {
    staged = committed ? { ...committed } : null;
    stagedAudit = [];
    const client = {
      resource: { findFirst, create, update },
      auditLog: { create: auditCreate }
    };
    try {
      const result = await operation(client);
      committed = staged ? { ...staged } : null;
      auditRows.push(...stagedAudit);
      return result;
    } finally {
      staged = null;
      stagedAudit = [];
    }
  };

  return {
    transaction,
    findFirst,
    create,
    update,
    auditCreate,
    current: () => committed,
    auditRows,
    failAuditWith(error: Error) {
      auditFailure = error;
    }
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("BaseService searchable lists", () => {
  it("composes case-insensitive search with tenant, deletion and pagination constraints", async () => {
    const repository = {
      list: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0)
    };
    const service = new BaseService(repository as unknown as BaseRepository, "Client", {
      orderBy: [{ name: "asc" }, { id: "asc" }],
      searchFields: ["name", "code"]
    });
    const request = {
      auth: { id: "user-a", email: "user@example.com", companyId: "company-a" },
      tenant: { companyId: "company-a" },
      query: { search: "  needle  ", page: "2", pageSize: "12" }
    } as unknown as ApiRequest;

    await service.list(request);

    const where = {
      companyId: "company-a",
      deletedAt: null,
      OR: [
        { name: { contains: "needle", mode: "insensitive" } },
        { code: { contains: "needle", mode: "insensitive" } }
      ]
    };
    expect(repository.list).toHaveBeenCalledWith({
      where,
      skip: 12,
      take: 12,
      orderBy: [{ name: "asc" }, { id: "asc" }]
    });
    expect(repository.count).toHaveBeenCalledWith(where);
  });
});

describe("BaseService audited writes", () => {
  it("creates one tenant-scoped resource and one audit row in the same transaction", async () => {
    const store = transactionalStore();
    persistence.transaction.mockImplementation(store.transaction);
    const service = new BaseService(new BaseRepository("resource"), "Resource", {
      userStamps: true
    });

    const created = await service.create(request(), {
      name: "Created",
      companyId: "company-b"
    });

    expect(persistence.transaction).toHaveBeenCalledOnce();
    expect(store.create).toHaveBeenCalledOnce();
    expect(store.create).toHaveBeenCalledWith({
      data: {
        name: "Created",
        companyId: "company-a",
        createdById: "user-a",
        updatedById: "user-a"
      }
    });
    expect(store.auditCreate).toHaveBeenCalledOnce();
    expect(store.auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        entityType: "Resource",
        entityId: "resource-a",
        action: "CREATE",
        companyId: "company-a",
        after: created,
        actorUserId: "user-a",
        requestId: "request-a"
      })
    });
    expect(store.current()).toEqual(created);
    expect(store.auditRows).toHaveLength(1);
    expect(persistence.getDelegate).not.toHaveBeenCalled();
  });

  it("reads before, updates after and audits both through one tenant-scoped transaction", async () => {
    const before = {
      id: "resource-a",
      companyId: "company-a",
      name: "Before",
      deletedAt: null
    };
    const store = transactionalStore(before);
    persistence.transaction.mockImplementation(store.transaction);
    const service = new BaseService(new BaseRepository("resource"), "Resource");

    const updated = await service.update(request(), "resource-a", { name: "After" });

    expect(persistence.transaction).toHaveBeenCalledOnce();
    expect(store.findFirst).toHaveBeenCalledOnce();
    expect(store.findFirst).toHaveBeenCalledWith({
      where: { id: "resource-a", companyId: "company-a", deletedAt: null },
      include: undefined
    });
    expect(store.update).toHaveBeenCalledOnce();
    expect(store.update).toHaveBeenCalledWith({
      where: { id: "resource-a", companyId: "company-a", deletedAt: null },
      data: { name: "After" }
    });
    expect(store.auditCreate).toHaveBeenCalledOnce();
    expect(store.auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "UPDATE",
        companyId: "company-a",
        before,
        after: updated
      })
    });
    expect(store.findFirst.mock.invocationCallOrder[0]).toBeLessThan(
      store.update.mock.invocationCallOrder[0]
    );
    expect(store.update.mock.invocationCallOrder[0]).toBeLessThan(
      store.auditCreate.mock.invocationCallOrder[0]
    );
    expect(store.current()).toEqual(updated);
    expect(store.auditRows).toHaveLength(1);
  });

  it("soft-deletes once and records the exact before and after values atomically", async () => {
    const before = {
      id: "resource-a",
      companyId: "company-a",
      name: "Before",
      deletedAt: null
    };
    const store = transactionalStore(before);
    persistence.transaction.mockImplementation(store.transaction);
    const service = new BaseService(new BaseRepository("resource"), "Resource", {
      userStamps: true
    });

    const removed = (await service.remove(request(), "resource-a")) as StoredResource;

    expect(persistence.transaction).toHaveBeenCalledOnce();
    expect(store.findFirst).toHaveBeenCalledOnce();
    expect(store.update).toHaveBeenCalledOnce();
    expect(store.update).toHaveBeenCalledWith({
      where: { id: "resource-a", companyId: "company-a", deletedAt: null },
      data: { deletedAt: expect.any(Date), deletedById: "user-a" }
    });
    expect(store.auditCreate).toHaveBeenCalledOnce();
    expect(store.auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "SOFT_DELETE",
        companyId: "company-a",
        before,
        after: removed
      })
    });
    expect(removed.deletedAt).toBeInstanceOf(Date);
    expect(store.current()).toEqual(removed);
    expect(store.auditRows).toHaveLength(1);
  });

  it("leaves the observable store unchanged when audit persistence rejects", async () => {
    const before = {
      id: "resource-a",
      companyId: "company-a",
      name: "Before",
      deletedAt: null
    };
    const failure = new Error("audit unavailable");
    const store = transactionalStore(before);
    store.failAuditWith(failure);
    persistence.transaction.mockImplementation(store.transaction);
    const service = new BaseService(new BaseRepository("resource"), "Resource");

    await expect(service.update(request(), "resource-a", { name: "After" })).rejects.toBe(failure);

    expect(persistence.transaction).toHaveBeenCalledOnce();
    expect(store.update).toHaveBeenCalledOnce();
    expect(store.auditCreate).toHaveBeenCalledOnce();
    expect(store.current()).toEqual(before);
    expect(store.auditRows).toEqual([]);
  });

  it("fails before mutation when an audited repository has no transaction contract", async () => {
    const repository = {
      create: vi.fn().mockResolvedValue({ id: "created" })
    };
    const service = new BaseService(repository as unknown as BaseRepository, "Resource");

    await expect(service.create(request(), { name: "Created" })).rejects.toMatchObject({
      code: "AUDIT_TRANSACTION_UNAVAILABLE"
    });

    expect(repository.create).not.toHaveBeenCalled();
    expect(persistence.transaction).not.toHaveBeenCalled();
    expect(persistence.getDelegate).not.toHaveBeenCalled();
  });

  it("preserves repository subtype overrides and instance state inside the transaction", async () => {
    class StatefulRepository extends BaseRepository {
      readonly state = { marker: "preserved-instance-state" };
      overrideCalls = 0;

      override async create(data: Record<string, unknown>) {
        this.overrideCalls += 1;
        return super.create({ ...data, repositoryMarker: this.state.marker });
      }
    }

    const store = transactionalStore();
    persistence.transaction.mockImplementation(store.transaction);
    const repository = new StatefulRepository("resource");
    const service = new BaseService(repository, "Resource");

    const created = await service.create(request(), { name: "Created" });

    expect(persistence.transaction).toHaveBeenCalledOnce();
    expect(repository.overrideCalls).toBe(1);
    expect(created).toEqual(
      expect.objectContaining({ repositoryMarker: "preserved-instance-state" })
    );
    expect(store.current()).toEqual(created);
  });

  it("reuses one transaction client for nested repository transactions", async () => {
    const store = transactionalStore();
    persistence.transaction.mockImplementation(store.transaction);
    const repository = new BaseRepository("resource");

    const created = await repository.withTransaction(async (outerRepository, transaction) => {
      expect(outerRepository).toBe(repository);
      return outerRepository.withTransaction(async (innerRepository, nestedTransaction) => {
        expect(innerRepository).toBe(repository);
        expect(nestedTransaction).toBe(transaction);
        return innerRepository.create({ name: "Created", companyId: "company-a" });
      });
    });

    expect(persistence.transaction).toHaveBeenCalledOnce();
    expect(store.create).toHaveBeenCalledOnce();
    expect(store.current()).toEqual(created);
  });

  it("preserves the non-transactional behaviour when audit writes are disabled", async () => {
    const repository = {
      create: vi.fn().mockResolvedValue({ id: "created" }),
      findById: vi.fn().mockResolvedValue({ id: "resource-a" }),
      update: vi.fn().mockResolvedValue({ id: "updated" }),
      softDelete: vi.fn().mockResolvedValue({ id: "removed" })
    };
    const service = new BaseService(repository as unknown as BaseRepository, "Resource", {
      auditWrites: false,
      userStamps: true
    });

    await service.create(request(), { name: "Created" });
    await service.update(request(), "resource-a", { name: "Updated" });
    await service.remove(request(), "resource-a");

    expect(persistence.transaction).not.toHaveBeenCalled();
    expect(repository.create).toHaveBeenCalledWith({
      name: "Created",
      companyId: "company-a",
      createdById: "user-a",
      updatedById: "user-a"
    });
    expect(repository.findById).toHaveBeenCalledTimes(2);
    expect(repository.update).toHaveBeenCalledWith(
      "resource-a",
      { name: "Updated", updatedById: "user-a" },
      "company-a"
    );
    expect(repository.softDelete).toHaveBeenCalledWith("resource-a", "user-a", "company-a");
    expect(persistence.getDelegate).not.toHaveBeenCalled();
  });
});
