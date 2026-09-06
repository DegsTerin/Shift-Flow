// en-GB: Verifies that Shift lifecycle commands are tenant-scoped, atomic and auditable.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiRequest } from "../../shared/http/request-types.js";
import { conflict } from "../../shared/errors/app-error.js";
import type { PrismaTransactionClient } from "../../shared/lib/prisma.js";
import type * as DateRangeService from "../../shared/services/date-range.service.js";
import { ShiftsRepository, type ShiftStatus } from "./shifts.repository.js";
import { ShiftsService } from "./shifts.service.js";
import { shiftUpdateSchema } from "./shifts.validators.js";

const companyTimezone = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock("../../shared/services/date-range.service.js", async (importOriginal) => ({
  ...(await importOriginal<typeof DateRangeService>()),
  loadCompanyTimezone: companyTimezone.load
}));

beforeEach(() => {
  companyTimezone.load.mockReset().mockResolvedValue("Europe/London");
});

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
    startsAt: new Date("2026-07-04T09:00:30.123Z"),
    endsAt: new Date("2026-07-04T17:00:40.987Z"),
    timezone: "Europe/London",
    closedAt: null,
    reopenedAt: null
  };
  const auditCreate = vi.fn().mockResolvedValue({ id: "audit-1" });
  const transaction = { auditLog: { create: auditCreate } } as PrismaTransactionClient;
  const repository = {
    findById: vi.fn(async () => ({ ...current })),
    findForUpdate: vi.fn(async () => ({ ...current })),
    update: vi.fn(async (_id: string, data: Record<string, unknown>) => {
      current = { ...current, ...data } as ShiftRow;
      return { ...current };
    }),
    create: vi.fn(async (data: Record<string, unknown>) => {
      current = { ...current, ...data } as ShiftRow;
      return { ...current };
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
    ) => {
      const before = { ...current };
      try {
        return await operation(repository as unknown as ShiftsRepository, transaction);
      } catch (error) {
        current = before;
        throw error;
      }
    }
  );

  return { repository, auditCreate, current: () => current };
}

describe("Shift update validation", () => {
  it.each(["CLOSED", "REOPENED", "CANCELLED", "UNKNOWN", null, 0, true])(
    "rejects creation with initial status %j before persistence",
    async (status) => {
      const { repository, auditCreate } = repositoryWith("PLANNED");
      await expect(
        new ShiftsService(repository as unknown as ShiftsRepository).create(request(), { status })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      expect(repository.withTransaction).not.toHaveBeenCalled();
      expect(auditCreate).not.toHaveBeenCalled();
      expect(companyTimezone.load).not.toHaveBeenCalled();
    }
  );

  it.each(["closedAt", "reopenedAt"])(
    "rejects creation with direct %s timestamp",
    async (field) => {
      const { repository } = repositoryWith("PLANNED");
      await expect(
        new ShiftsService(repository as unknown as ShiftsRepository).create(request(), {
          [field]: null
        })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      expect(repository.withTransaction).not.toHaveBeenCalled();
    }
  );

  it.each([undefined, "PLANNED", "OPEN"])(
    "preserves initial state %s and the omitted database default",
    async (status) => {
      const { repository } = repositoryWith("PLANNED");
      await new ShiftsService(repository as unknown as ShiftsRepository).create(request(), {
        name: "New shift",
        startsAt: "2026-09-04T09:00:00Z",
        endsAt: "2026-09-04T17:00:00Z",
        timezone: "UTC",
        ...(status === undefined ? {} : { status })
      });
      const data = repository.create.mock.calls[0]?.[0];
      if (status === undefined) expect(data).not.toHaveProperty("status");
      else expect(data).toMatchObject({ status });
    }
  );

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

describe("Shift zoned periods", () => {
  it("resolves a create period using Company only when the Shift timezone is absent", async () => {
    const { repository, auditCreate } = repositoryWith("OPEN");
    const service = new ShiftsService(repository as unknown as ShiftsRepository);
    await service.create(request(), {
      name: "Day shift",
      startsAt: "2026-07-04T10:00",
      endsAt: "2026-07-04T18:00"
    });
    expect(companyTimezone.load).toHaveBeenCalledWith(companyId);
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId,
        timezone: "Europe/London",
        startsAt: new Date("2026-07-04T09:00Z"),
        endsAt: new Date("2026-07-04T17:00Z")
      })
    );
    expect(auditCreate).toHaveBeenCalledOnce();
  });

  it("uses the explicit Shift timezone and preserves offset instant precision", async () => {
    const { repository } = repositoryWith("OPEN");
    const service = new ShiftsService(repository as unknown as ShiftsRepository);
    await service.create(request(), {
      name: "Night shift",
      timezone: "America/Sao_Paulo",
      startsAt: "2026-07-04t10:00:30.123456789012z",
      endsAt: "2026-07-04T18:00"
    });
    expect(companyTimezone.load).not.toHaveBeenCalled();
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        startsAt: new Date("2026-07-04T10:00:30.123Z"),
        endsAt: new Date("2026-07-04T21:00Z")
      })
    );
  });

  it.each(["2026-03-29T01:30", "2026-10-25T01:30"])(
    "rejects a missing or repeated Shift wall time %s before writing",
    async (startsAt) => {
      const { repository, auditCreate } = repositoryWith("OPEN");
      const service = new ShiftsService(repository as unknown as ShiftsRepository);
      await expect(
        service.create(request(), {
          name: "Ambiguous shift",
          timezone: "Europe/London",
          startsAt,
          endsAt: "2026-11-01T10:00"
        })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      expect(repository.create).not.toHaveBeenCalled();
      expect(auditCreate).not.toHaveBeenCalled();
    }
  );

  it("preserves the stored Shift zone when resolving a partial period update", async () => {
    const { repository, current, auditCreate } = repositoryWith("OPEN");
    const service = new ShiftsService(repository as unknown as ShiftsRepository);
    await service.update(request(), "shift-1", { startsAt: "2026-07-04T12:00" });
    expect(repository.findForUpdate).toHaveBeenCalledWith(expect.any(Object), "shift-1", companyId);
    expect(repository.findById).not.toHaveBeenCalled();
    expect(repository.update).toHaveBeenCalledWith(
      "shift-1",
      { startsAt: new Date("2026-07-04T11:00Z"), updatedById: actorUserId },
      companyId
    );
    expect(current()).toMatchObject({
      endsAt: new Date("2026-07-04T17:00:40.987Z"),
      timezone: "Europe/London"
    });
    expect(companyTimezone.load).not.toHaveBeenCalled();
    expect(auditCreate).toHaveBeenCalledOnce();
  });

  it("omits both temporal writes during name-only and timezone-only updates", async () => {
    const { repository, current } = repositoryWith("OPEN");
    const original = current();
    const service = new ShiftsService(repository as unknown as ShiftsRepository);
    await service.update(request(), "shift-1", { name: "New name" });
    await service.update(request(), "shift-1", { timezone: "Asia/Kathmandu" });
    expect(repository.update).toHaveBeenLastCalledWith(
      "shift-1",
      { timezone: "Asia/Kathmandu", updatedById: actorUserId },
      companyId
    );
    expect(current()).toMatchObject({
      startsAt: original.startsAt,
      endsAt: original.endsAt,
      name: "New name"
    });
    expect(companyTimezone.load).not.toHaveBeenCalled();
  });

  it.each([
    { startsAt: "2026-07-04T20:00" },
    { endsAt: "2026-07-04T08:00" },
    { startsAt: null },
    { timezone: "Invalid/Zone" }
  ])("rejects an invalid merged interval or zone %j without an update or audit", async (data) => {
    const { repository, auditCreate } = repositoryWith("OPEN");
    const service = new ShiftsService(repository as unknown as ShiftsRepository);
    await expect(service.update(request(), "shift-1", data)).rejects.toMatchObject({
      code: "BAD_REQUEST"
    });
    expect(repository.update).not.toHaveBeenCalled();
    expect(auditCreate).not.toHaveBeenCalled();
  });

  it("uses the same rollback boundary for a temporal update and its audit", async () => {
    const { repository, auditCreate, current } = repositoryWith("OPEN");
    const original = current();
    auditCreate.mockRejectedValueOnce(new Error("audit unavailable"));
    const service = new ShiftsService(repository as unknown as ShiftsRepository);
    await expect(
      service.update(request(), "shift-1", { startsAt: "2026-07-04T12:00" })
    ).rejects.toThrow("audit unavailable");
    expect(repository.update).toHaveBeenCalledOnce();
    expect(current()).toEqual(original);
  });

  it("validates the post-lock current pair so concurrent partial updates cannot invert it", async () => {
    let row = {
      id: "shift-1",
      companyId,
      startsAt: new Date("2026-07-04T09:00Z"),
      endsAt: new Date("2026-07-04T17:00Z"),
      timezone: "Europe/London"
    };
    const auditCreate = vi.fn().mockResolvedValue({ id: "audit-1" });
    let lockTail = Promise.resolve();
    const repository = {
      findForUpdate: vi.fn(async (transaction: PrismaTransactionClient) => {
        const previous = lockTail;
        let unlock!: () => void;
        lockTail = new Promise<void>((resolve) => {
          unlock = resolve;
        });
        await previous;
        transaction.unlock = unlock;
        return { ...row };
      }),
      update: vi.fn(async (_id: string, data: Record<string, unknown>) => {
        row = { ...row, ...data };
        return { ...row };
      }),
      withTransaction: vi.fn()
    };
    repository.withTransaction.mockImplementation(
      async (
        operation: (
          repository: ShiftsRepository,
          transaction: PrismaTransactionClient
        ) => Promise<unknown>
      ) => {
        const transaction: PrismaTransactionClient = { auditLog: { create: auditCreate } };
        try {
          return await operation(repository as unknown as ShiftsRepository, transaction);
        } finally {
          (transaction.unlock as (() => void) | undefined)?.();
        }
      }
    );
    const service = new ShiftsService(repository as unknown as ShiftsRepository);
    const results = await Promise.allSettled([
      service.update(request(), "shift-1", { startsAt: "2026-07-04T16:00:00Z" }),
      service.update(request(), "shift-1", { endsAt: "2026-07-04T10:00:00Z" })
    ]);
    expect(results.map((result) => result.status)).toEqual(["fulfilled", "rejected"]);
    expect(row.startsAt.getTime()).toBeLessThan(row.endsAt.getTime());
    expect(repository.findForUpdate).toHaveBeenCalledTimes(2);
    expect(repository.update).toHaveBeenCalledOnce();
    expect(auditCreate).toHaveBeenCalledOnce();
  });
});

describe("Shift lifecycle commands", () => {
  const allowed: Record<"open" | "close" | "reopen" | "cancel", readonly ShiftStatus[]> = {
    open: ["PLANNED"],
    close: ["PLANNED", "OPEN", "REOPENED"],
    reopen: ["CLOSED"],
    cancel: ["PLANNED", "OPEN", "REOPENED"]
  };
  const targets = {
    open: "OPEN",
    close: "CLOSED",
    reopen: "REOPENED",
    cancel: "CANCELLED"
  } as const;
  for (const command of ["open", "close", "reopen", "cancel"] as const) {
    it.each<ShiftStatus>(["PLANNED", "OPEN", "CLOSED", "REOPENED", "CANCELLED"])(
      `${command} enforces its exact source-state matrix from %s`,
      async (status) => {
        const { repository, auditCreate, current } = repositoryWith(status);
        const service = new ShiftsService(repository as unknown as ShiftsRepository);
        if (allowed[command].includes(status)) {
          await expect(service[command](request(), "shift-1")).resolves.toMatchObject({
            status: targets[command]
          });
          expect(repository.findById).toHaveBeenCalledWith("shift-1", companyId);
          expect(repository.transitionStatus).toHaveBeenCalledWith(
            expect.any(Object),
            "shift-1",
            companyId,
            status,
            expect.objectContaining({ status: targets[command], updatedById: actorUserId })
          );
          expect(auditCreate).toHaveBeenCalledOnce();
          expect(auditCreate).toHaveBeenCalledWith({
            data: expect.objectContaining({
              entityType: "Shift",
              entityId: "shift-1",
              action: "UPDATE",
              companyId,
              before: expect.objectContaining({ status }),
              after: expect.objectContaining({ status: targets[command] })
            })
          });
        } else {
          await expect(service[command](request(), "shift-1")).rejects.toMatchObject({
            code: "BAD_REQUEST"
          });
          expect(repository.transitionStatus).not.toHaveBeenCalled();
          expect(auditCreate).not.toHaveBeenCalled();
          expect(current().status).toBe(status);
        }
      }
    );

    it(`${command} shares the transaction rollback boundary with its required audit`, async () => {
      const { repository, auditCreate, current } = repositoryWith(
        command === "reopen" ? "CLOSED" : "PLANNED"
      );
      const before = { ...current() };
      auditCreate.mockRejectedValueOnce(new Error("audit unavailable"));
      await expect(
        new ShiftsService(repository as unknown as ShiftsRepository)[command](request(), "shift-1")
      ).rejects.toThrow("audit unavailable");
      expect(repository.transitionStatus).toHaveBeenCalledOnce();
      expect(current()).toEqual(before);
    });

    it(`${command} rejects a missing or other-tenant Shift`, async () => {
      const { repository, auditCreate } = repositoryWith("OPEN");
      repository.findById.mockResolvedValueOnce(null as unknown as ShiftRow);
      await expect(
        new ShiftsService(repository as unknown as ShiftsRepository)[command](request(), "shift-1")
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      expect(repository.transitionStatus).not.toHaveBeenCalled();
      expect(auditCreate).not.toHaveBeenCalled();
    });
  }

  it("cancels without clearing previous reopen evidence or deleting the Shift", async () => {
    const { repository, current } = repositoryWith("REOPENED");
    const reopenedAt = new Date("2026-09-04T08:00:00Z");
    current().reopenedAt = reopenedAt;
    await new ShiftsService(repository as unknown as ShiftsRepository).cancel(request(), "shift-1");
    expect(current()).toMatchObject({ status: "CANCELLED", reopenedAt, closedAt: null });
    expect(current()).not.toHaveProperty("deletedAt");
    expect(repository.transitionStatus.mock.calls[0]?.[4]).toEqual({
      status: "CANCELLED",
      updatedById: actorUserId
    });
  });

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

  it.each([
    { initial: "OPEN", left: "close", right: "close" },
    { initial: "PLANNED", left: "open", right: "close" },
    { initial: "PLANNED", left: "open", right: "cancel" },
    { initial: "OPEN", left: "close", right: "cancel" },
    { initial: "REOPENED", left: "cancel", right: "close" },
    { initial: "CLOSED", left: "reopen", right: "reopen" }
  ] as const)(
    "allows one winner/event for competing $left/$right from $initial",
    async ({ initial, left, right }) => {
      let current: ShiftRow = { id: "shift-1", companyId, status: initial };
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
        service[left](request(), "shift-1"),
        service[right](request(), "shift-1")
      ]);

      expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
      expect(auditCreate).toHaveBeenCalledOnce();
      expect(current).toMatchObject({ status: targets[left] });
      if (left === "close") expect(current.closedAt).toEqual(now);
    }
  );
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
