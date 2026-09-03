// en-GB: Proves per-identity admission and the global FIFO password-work budget.
import { describe, expect, it, vi } from "vitest";
import {
  LoginFailureAuditGate,
  LoginFailureDelayGate,
  LoginSuccessTelemetryGate,
  LoginVerificationGate
} from "./login-verification-gate.js";

function deferred() {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

describe("LoginVerificationGate", () => {
  it("admits only one scheduled bcrypt operation for the same exact identity", async () => {
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

  it("releases the identity as soon as bcrypt finishes while the outer flow remains active", async () => {
    const gate = new LoginVerificationGate(1, 4, 4);
    const passwordFinished = deferred();
    const releaseOuterFlow = deferred();
    const first = gate.run("identity-a", async (withPasswordBudget) => {
      await withPasswordBudget(async () => undefined);
      passwordFinished.resolve();
      await releaseOuterFlow.promise;
    });

    await passwordFinished.promise;
    await expect(
      gate.run("identity-a", async (withPasswordBudget) =>
        withPasswordBudget(async () => "legitimate")
      )
    ).resolves.toBe("legitimate");

    releaseOuterFlow.resolve();
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

  it("bounds attacker-controlled scheduled identity cardinality", async () => {
    const gate = new LoginVerificationGate(1, 1, 1);
    let release: () => void = () => undefined;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    const admitted = gate.run("identity-a", async (withPasswordBudget) =>
      withPasswordBudget(async () => blocked)
    );

    await expect(
      gate.run("identity-b", async (withPasswordBudget) =>
        withPasswordBudget(async () => undefined)
      )
    ).rejects.toMatchObject({ statusCode: 429, code: "AUTHENTICATION_BUSY" });
    release();
    await admitted;
  });

  it("bounds relational lookup work before an identity reaches bcrypt", async () => {
    const gate = new LoginVerificationGate(4, 128, 128);
    const releaseLookups = deferred();
    const lookups = Array.from({ length: 128 }, (_, index) =>
      gate.run(`unknown-${index}`, async () => releaseLookups.promise)
    );

    await expect(gate.run("overflow", async () => undefined)).rejects.toMatchObject({
      statusCode: 429,
      code: "AUTHENTICATION_BUSY"
    });

    releaseLookups.resolve();
    await Promise.all(lookups);
    await expect(gate.run("overflow", async () => "recovered")).resolves.toBe("recovered");
  });

  it("does not count completed bcrypt work from 128 still-active unknown flows", async () => {
    const gate = new LoginVerificationGate(4, 128, 128);
    const releaseOuterFlows = deferred();
    let completedPasswordChecks = 0;
    const hostileFlows = Array.from({ length: 128 }, (_, index) =>
      gate.run(`unknown-${index}`, async (withPasswordBudget) => {
        await withPasswordBudget(async () => {
          completedPasswordChecks += 1;
        });
        await releaseOuterFlows.promise;
      })
    );

    await vi.waitFor(() => expect(completedPasswordChecks).toBe(128));
    await expect(
      gate.run("legitimate", async (withPasswordBudget) =>
        withPasswordBudget(async () => "admitted")
      )
    ).resolves.toBe("admitted");

    releaseOuterFlows.resolve();
    await Promise.all(hostileFlows);
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
  it("coalesces unbounded identities into one fixed-window aggregate", () => {
    let now = 1_000;
    const gate = new LoginFailureAuditGate(60_000, () => now);

    expect(gate.takeAggregate()).toBe(1);
    for (let index = 0; index < 2_000; index += 1) {
      expect(gate.takeAggregate()).toBeUndefined();
    }
    now += 60_000;
    expect(gate.takeAggregate()).toBe(2_001);
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

describe("LoginFailureDelayGate", () => {
  it("applies the same capped progression and expires fixed decoy state", () => {
    let now = 1_000;
    const gate = new LoginFailureDelayGate(8, new Uint8Array(32).fill(7), () => now);
    const key = "principal-identity-hash";

    expect(gate.recordFailure(key, 3, 60_000)).toBeUndefined();
    expect(gate.recordFailure(key, 3, 60_000)).toBeUndefined();
    expect(gate.recordFailure(key, 3, 60_000)?.getTime()).toBe(now + 1_000);

    now += 1_000;
    expect(gate.recordFailure(key, 3, 60_000)?.getTime()).toBe(now + 2_000);
    now += 2_000;
    expect(gate.recordFailure(key, 3, 60_000)?.getTime()).toBe(now + 4_000);

    now += 60_000;
    expect(gate.recordFailure(key, 3, 60_000)).toBeUndefined();
  });

  it("keeps attacker-controlled identities inside a fixed HMAC bucket set", () => {
    const gate = new LoginFailureDelayGate(1, new Uint8Array(32).fill(9), () => 1_000);

    for (let index = 0; index < 2_000; index += 1) {
      gate.recordFailure(`identity-${index}`, 5, 60_000);
    }

    expect(gate.recordFailure("any-identity", 5, 60_000)?.getTime()).toBe(31_000);
  });
});
