// en-GB: Proves per-identity admission and the global FIFO password-work budget.
import { describe, expect, it, vi } from "vitest";
import {
  LoginFailureAuditGate,
  LoginSuccessTelemetryGate,
  LoginVerificationGate,
  UnknownLoginBackoffGate
} from "./login-verification-gate.js";

describe("LoginVerificationGate", () => {
  it("admits only one operation for the same exact identity", async () => {
    const gate = new LoginVerificationGate(2, 4, 4);
    let release: () => void = () => undefined;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    const first = gate.run("identity-a", async (withPasswordBudget) =>
      withPasswordBudget(async () => blocked)
    );

    await expect(
      gate.run("identity-a", async (withPasswordBudget) =>
        withPasswordBudget(async () => undefined)
      )
    ).rejects.toMatchObject({ statusCode: 429, code: "AUTHENTICATION_BUSY" });
    release();
    await first;
  });

  it("serves distinct identities through one global FIFO bcrypt budget", async () => {
    const gate = new LoginVerificationGate(1, 4, 4);
    let releaseFirst: () => void = () => undefined;
    const firstBlocked = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const order: string[] = [];

    const first = gate.run("identity-a", async (withPasswordBudget) =>
      withPasswordBudget(async () => {
        order.push("first-started");
        await firstBlocked;
        order.push("first-finished");
      })
    );
    const second = gate.run("identity-b", async (withPasswordBudget) =>
      withPasswordBudget(async () => {
        order.push("second-started");
      })
    );

    await vi.waitFor(() => expect(order).toEqual(["first-started"]));
    releaseFirst();
    await Promise.all([first, second]);

    expect(order).toEqual(["first-started", "first-finished", "second-started"]);
  });

  it("bounds attacker-controlled identity cardinality", async () => {
    const gate = new LoginVerificationGate(1, 1, 1);
    let release: () => void = () => undefined;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    const admitted = gate.run("identity-a", async () => blocked);

    await expect(gate.run("identity-b", async () => undefined)).rejects.toMatchObject({
      statusCode: 429,
      code: "AUTHENTICATION_BUSY"
    });
    release();
    await admitted;
  });

  it("releases an identity after its operation rejects", async () => {
    const gate = new LoginVerificationGate(1, 2, 2);

    await expect(
      gate.run("identity-a", async () => {
        throw new Error("synthetic rejection");
      })
    ).rejects.toThrow("synthetic rejection");
    await expect(gate.run("identity-a", async () => "recovered")).resolves.toBe("recovered");
  });

  it("releases the rejected identity when the password queue overflows", async () => {
    const gate = new LoginVerificationGate(1, 3, 1);
    let releaseFirst: () => void = () => undefined;
    const firstBlocked = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const first = gate.run("identity-a", async (withPasswordBudget) =>
      withPasswordBudget(async () => firstBlocked)
    );
    const second = gate.run("identity-b", async (withPasswordBudget) =>
      withPasswordBudget(async () => undefined)
    );

    await expect(
      gate.run("identity-c", async (withPasswordBudget) =>
        withPasswordBudget(async () => undefined)
      )
    ).rejects.toMatchObject({ statusCode: 429, code: "AUTHENTICATION_BUSY" });
    releaseFirst();
    await Promise.all([first, second]);
    await expect(gate.run("identity-c", async () => "recovered")).resolves.toBe("recovered");
  });
});

describe("LoginFailureAuditGate", () => {
  it("coalesces unbounded identities into two fixed-window aggregates", () => {
    let now = 1_000;
    const gate = new LoginFailureAuditGate(60_000, () => now);

    expect(gate.takeAggregate("known")).toBe(1);
    expect(gate.takeAggregate("unknown")).toBe(1);
    for (let index = 0; index < 2_000; index += 1) {
      expect(gate.takeAggregate("known")).toBeUndefined();
      expect(gate.takeAggregate("unknown")).toBeUndefined();
    }
    now += 60_000;
    expect(gate.takeAggregate("known")).toBe(2_001);
    expect(gate.takeAggregate("unknown")).toBe(2_001);
  });
});

describe("LoginSuccessTelemetryGate", () => {
  it("coalesces successful logins into one fixed-window aggregate", () => {
    let now = 1_000;
    const gate = new LoginSuccessTelemetryGate(60_000, () => now);

    expect(gate.takeAggregate()).toBe(1);
    for (let index = 0; index < 2_000; index += 1) {
      expect(gate.takeAggregate()).toBeUndefined();
    }
    now += 60_000;
    expect(gate.takeAggregate()).toBe(2_001);
  });
});

describe("UnknownLoginBackoffGate", () => {
  it("applies the same capped progression and expires fixed decoy state", () => {
    let now = 1_000;
    const gate = new UnknownLoginBackoffGate(8, new Uint8Array(32).fill(7), () => now);
    const key = "unknown-identity-hash";

    expect(gate.currentBackoffUntil(key, 60_000)).toBeUndefined();
    expect(gate.recordFailure(key, 3, 60_000)).toBeUndefined();
    expect(gate.recordFailure(key, 3, 60_000)).toBeUndefined();
    expect(gate.recordFailure(key, 3, 60_000)?.getTime()).toBe(now + 1_000);

    now += 1_000;
    expect(gate.recordFailure(key, 3, 60_000)?.getTime()).toBe(now + 2_000);
    now += 2_000;
    expect(gate.recordFailure(key, 3, 60_000)?.getTime()).toBe(now + 4_000);

    now += 60_000;
    expect(gate.currentBackoffUntil(key, 60_000)).toBeUndefined();
    expect(gate.recordFailure(key, 3, 60_000)).toBeUndefined();
  });

  it("keeps attacker-controlled identities inside a fixed HMAC bucket set", () => {
    const gate = new UnknownLoginBackoffGate(1, new Uint8Array(32).fill(9), () => 1_000);

    for (let index = 0; index < 2_000; index += 1) {
      gate.recordFailure(`identity-${index}`, 5, 60_000);
    }

    expect(gate.currentBackoffUntil("any-identity", 60_000)?.getTime()).toBe(31_000);
  });
});
