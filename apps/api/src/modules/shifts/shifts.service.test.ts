// en-GB: Verifies that Shift lifecycle commands are tenant-scoped, atomic and auditable.
import { describe, expect, it, vi } from "vitest";
import type { ApiRequest } from "../../shared/http/request-types.js";
import { conflict } from "../../shared/errors/app-error.js";
import type { PrismaTransactionClient } from "../../shared/lib/prisma.js";
import { ShiftsRepository, type ShiftStatus } from "./shifts.repository.js";
import { ShiftsService } from "./shifts.service.js";
import { shiftUpdateSchema } from "./shifts.validators.js";

const companyId = "c40e2a7b-72a8-4aca-a780-d6d239134d38";
const actorUserId = "1b0be957-c868-442c-91de-82f7abe3df9a";

type ShiftRow = Record<string, unknown> & {
  id: string;
  companyId: string;
  status: ShiftStatus;
};

function request(): ApiRequest {
  return {
    query: {},
    auth: { id: actorUserId, email: "owner@example.com", companyId },
    tenant: { companyId }
  } as unknown as ApiRequest;
}

function repositoryWith(initialStatus: ShiftStatus) {
  let current: ShiftRow = {
    id: "shift-1",
    companyId,
    status: initialStatus,
    closedAt: null,
    reopenedAt: null
  };
  const auditCreate = vi.fn().mockResolvedValue({ id: "audit-1" });
  const transaction = { auditLog: { create: auditCreate } } as PrismaTransactionClient;
  const repository = {
    findById: vi.fn(async () => ({ ...current })),
    transitionStatus: vi.fn(
      async (
        _transaction: PrismaTransactionClient,
        _id: string,
        _companyId: string,
        expectedStatus: ShiftStatus,
        data: Record<string, unknown>
      ) => {
        if (current.status !== expectedStatus) {
          throw conflict("Shift status changed during transition");
        }
        current = { ...current, ...data } as ShiftRow;
        return { ...current };
      }
    ),
    withTransaction: vi.fn()
  };
  repository.withTransaction.mockImplementation(
    async <T>(
      operation: (
        scopedRepository: ShiftsRepository,
        scopedTransaction: PrismaTransactionClient
      ) => Promise<T>
    ) => operation(repository as unknown as ShiftsRepository, transaction)
  );

  return { repository, auditCreate, current: () => current };
}

describe("Shift update validation", () => {
  it("rejects status and lifecycle timestamps from the generic PATCH contract", () => {
    expect(shiftUpdateSchema.safeParse({ status: "CLOSED" }).success).toBe(false);
    expect(shiftUpdateSchema.safeParse({ closedAt: new Date() }).success).toBe(false);
    expect(shiftUpdateSchema.safeParse({ reopenedAt: new Date() }).success).toBe(false);
    expect(shiftUpdateSchema.safeParse({}).success).toBe(false);
    expect(shiftUpdateSchema.safeParse({ name: "Night shift" }).success).toBe(true);
  });

  it("rejects lifecycle fields in the service even without route validation", async () => {
    const { repository } = repositoryWith("OPEN");
    const service = new ShiftsService(repository as unknown as ShiftsRepository);

    await expect(service.update(request(), "shift-1", { status: "CLOSED" })).rejects.toMatchObject({
      statusCode: 400,
      code: "BAD_REQUEST"
    });
    expect(repository.withTransaction).not.toHaveBeenCalled();
  });
});

describe("Shift lifecycle commands", () => {
  it.each<ShiftStatus>(["PLANNED", "OPEN", "REOPENED"])(
    "closes from %s with one audited, tenant-scoped transition",
    async (status) => {
      const now = new Date("2026-09-02T12:00:00.000Z");
      const { repository, auditCreate, current } = repositoryWith(status);
      const service = new ShiftsService(repository as unknown as ShiftsRepository, () => now);

      await expect(service.close(request(), "shift-1")).resolves.toMatchObject({
        status: "CLOSED",
        closedAt: now,
        updatedById: actorUserId
      });

      expect(repository.transitionStatus).toHaveBeenCalledWith(
        expect.any(Object),
        "shift-1",
        companyId,
        status,
        { status: "CLOSED", closedAt: now, updatedById: actorUserId }
      );
      expect(auditCreate).toHaveBeenCalledOnce();
      expect(auditCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          entityType: "Shift",
          entityId: "shift-1",
          action: "UPDATE",
          companyId,
          before: expect.objectContaining({ status }),
          after: expect.objectContaining({ status: "CLOSED", closedAt: now })
        })
      });
      expect(current()).toMatchObject({ status: "CLOSED", closedAt: now });
    }
  );

  it.each<ShiftStatus>(["CLOSED", "CANCELLED"])("rejects close from %s", async (status) => {
    const { repository, auditCreate } = repositoryWith(status);
    const service = new ShiftsService(repository as unknown as ShiftsRepository);

    await expect(service.close(request(), "shift-1")).rejects.toMatchObject({
      statusCode: 400,
      code: "BAD_REQUEST"
    });
    expect(repository.transitionStatus).not.toHaveBeenCalled();
    expect(auditCreate).not.toHaveBeenCalled();
  });

  it("reopens only a closed Shift and keeps lifecycle timestamps coherent", async () => {
    const now = new Date("2026-09-02T12:30:00.000Z");
    const { repository, auditCreate, current } = repositoryWith("CLOSED");
    const service = new ShiftsService(repository as unknown as ShiftsRepository, () => now);

    await expect(service.reopen(request(), "shift-1")).resolves.toMatchObject({
      status: "REOPENED",
      reopenedAt: now,
      closedAt: null,
      updatedById: actorUserId
    });
    expect(auditCreate).toHaveBeenCalledOnce();
    expect(current()).toMatchObject({ status: "REOPENED", reopenedAt: now, closedAt: null });

    for (const status of ["PLANNED", "OPEN", "REOPENED", "CANCELLED"] as const) {
      const invalid = repositoryWith(status);
      const invalidService = new ShiftsService(
        invalid.repository as unknown as ShiftsRepository,
        () => now
      );
      await expect(invalidService.reopen(request(), "shift-1")).rejects.toMatchObject({
        statusCode: 400,
        code: "BAD_REQUEST"
      });
      expect(invalid.repository.transitionStatus).not.toHaveBeenCalled();
      expect(invalid.auditCreate).not.toHaveBeenCalled();
    }
  });

  it("allows exactly one winner and one audit for concurrent close commands", async () => {
    let current: ShiftRow = { id: "shift-1", companyId, status: "OPEN" };
    let readCount = 0;
    let releaseReads!: () => void;
    const bothReads = new Promise<void>((resolve) => {
      releaseReads = resolve;
    });
    const auditCreate = vi.fn().mockResolvedValue({ id: "audit-1" });
    const transaction = { auditLog: { create: auditCreate } } as PrismaTransactionClient;
    const repository = {
      findById: vi.fn(async () => {
        const snapshot = { ...current };
        readCount += 1;
        if (readCount === 2) releaseReads();
        await bothReads;
        return snapshot;
      }),
      transitionStatus: vi.fn(
        async (
          _transaction: PrismaTransactionClient,
          _id: string,
          _companyId: string,
          expectedStatus: ShiftStatus,
          data: Record<string, unknown>
        ) => {
          if (current.status !== expectedStatus) {
            throw conflict("Shift status changed during transition");
          }
          current = { ...current, ...data } as ShiftRow;
          return { ...current };
        }
      ),
      withTransaction: vi.fn()
    };
    repository.withTransaction.mockImplementation(
      async <T>(
        operation: (
          scopedRepository: ShiftsRepository,
          scopedTransaction: PrismaTransactionClient
        ) => Promise<T>
      ) => operation(repository as unknown as ShiftsRepository, transaction)
    );
    const now = new Date("2026-09-02T13:00:00.000Z");
    const service = new ShiftsService(repository as unknown as ShiftsRepository, () => now);

    const results = await Promise.allSettled([
      service.close(request(), "shift-1"),
      service.close(request(), "shift-1")
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(auditCreate).toHaveBeenCalledOnce();
    expect(current).toMatchObject({ status: "CLOSED", closedAt: now });
  });
});

describe("ShiftsRepository.transitionStatus", () => {
  it("uses the tenant, deletion and expected-status predicates in one conditional update", async () => {
    const update = vi.fn().mockResolvedValue({ id: "shift-1", status: "CLOSED" });
    const transaction = { shift: { update } } as PrismaTransactionClient;
    const repository = new ShiftsRepository();

    await repository.transitionStatus(transaction, "shift-1", companyId, "OPEN", {
      status: "CLOSED"
    });

    expect(update).toHaveBeenCalledWith({
      where: { id: "shift-1", companyId, deletedAt: null, status: "OPEN" },
      data: { status: "CLOSED" }
    });
  });

  it("maps a lost conditional update to a stable conflict", async () => {
    const update = vi.fn().mockRejectedValue({ code: "P2025" });
    const transaction = { shift: { update } } as PrismaTransactionClient;
    const repository = new ShiftsRepository();

    await expect(
      repository.transitionStatus(transaction, "shift-1", companyId, "OPEN", {
        status: "CLOSED"
      })
    ).rejects.toMatchObject({
      statusCode: 409,
      code: "CONFLICT",
      message: "Shift status changed during transition"
    });
  });
});
