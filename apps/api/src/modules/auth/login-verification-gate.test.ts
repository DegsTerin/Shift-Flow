// en-GB: Proves per-identity admission and the global FIFO password-work budget.
import { describe, expect, it, vi } from "vitest";
import {
  AuthenticationRequestCancelledError,
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

function rejectedDeferred() {
  let reject: (error: unknown) => void = () => undefined;
  const promise = new Promise<never>((_resolve, fail) => {
    reject = fail;
  });
  return { promise, reject };
}

describe("LoginVerificationGate", () => {
  it("rejects a pre-aborted request without admitting or executing it", async () => {
    const gate = new LoginVerificationGate(1, 1, 1);
    const cancellation = new AbortController();
    const operation = vi.fn(async () => undefined);
    cancellation.abort();

    await expect(gate.run("identity-a", operation, cancellation.signal)).rejects.toBeInstanceOf(
      AuthenticationRequestCancelledError
    );
    expect(operation).not.toHaveBeenCalled();
    await expect(gate.run("identity-a", async () => "admitted")).resolves.toBe("admitted");
  });

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

  it("removes exactly one aborted queued operation and preserves FIFO capacity", async () => {
    const gate = new LoginVerificationGate(1, 5, 2);
    const releaseActive = deferred();
    const queuedCancellation = new AbortController();
    const removeListener = vi.spyOn(queuedCancellation.signal, "removeEventListener");
    const order: string[] = [];
    const active = gate.run("identity-active", async (withPasswordBudget) =>
      withPasswordBudget(async () => {
        order.push("active");
        await releaseActive.promise;
      })
    );
    const aborted = gate.run(
      "identity-aborted",
      async (withPasswordBudget) =>
        withPasswordBudget(async () => {
          order.push("aborted-must-not-run");
        }),
      queuedCancellation.signal
    );
    const retained = gate.run("identity-retained", async (withPasswordBudget) =>
      withPasswordBudget(async () => {
        order.push("retained");
      })
    );

    queuedCancellation.abort();
    queuedCancellation.abort();
    await expect(aborted).rejects.toBeInstanceOf(AuthenticationRequestCancelledError);
    const replacement = gate.run("identity-replacement", async (withPasswordBudget) =>
      withPasswordBudget(async () => {
        order.push("replacement");
      })
    );

    releaseActive.resolve();
    await Promise.all([active, retained, replacement]);

    expect(order).toEqual(["active", "retained", "replacement"]);
    expect(removeListener).toHaveBeenCalledOnce();
    await expect(
      gate.run("identity-aborted", async (withPasswordBudget) =>
        withPasswordBudget(async () => "identity-reused")
      )
    ).resolves.toBe("identity-reused");
  });

  it("keeps an aborted active bcrypt operation admitted until it settles", async () => {
    const gate = new LoginVerificationGate(1, 3, 2);
    const releaseActive = deferred();
    const cancellation = new AbortController();
    const order: string[] = [];
    const active = gate.run(
      "identity-active",
      async (withPasswordBudget) =>
        withPasswordBudget(async () => {
          order.push("active-started");
          await releaseActive.promise;
          order.push("active-settled");
        }),
      cancellation.signal
    );
    await vi.waitFor(() => expect(order).toEqual(["active-started"]));

    cancellation.abort();
    let activeSettled = false;
    void active.then(
      () => {
        activeSettled = true;
      },
      () => {
        activeSettled = true;
      }
    );
    await Promise.resolve();
    expect(activeSettled).toBe(false);
    await expect(gate.run("identity-active", async () => undefined)).rejects.toMatchObject({
      code: "AUTHENTICATION_BUSY"
    });

    const queued = gate.run("identity-queued", async (withPasswordBudget) =>
      withPasswordBudget(async () => {
        order.push("queued-started");
      })
    );
    await Promise.resolve();
    expect(order).toEqual(["active-started"]);

    releaseActive.resolve();
    await expect(active).rejects.toBeInstanceOf(AuthenticationRequestCancelledError);
    await queued;
    expect(order).toEqual(["active-started", "active-settled", "queued-started"]);
  });

  it("observes an aborted active bcrypt rejection before recovering capacity", async () => {
    const gate = new LoginVerificationGate(1, 1, 1);
    const passwordFailure = rejectedDeferred();
    const passwordStarted = deferred();
    const cancellation = new AbortController();
    const active = gate.run(
      "identity-active",
      async (withPasswordBudget) =>
        withPasswordBudget(async () => {
          passwordStarted.resolve();
          return passwordFailure.promise;
        }),
      cancellation.signal
    );
    await passwordStarted.promise;

    cancellation.abort();
    await expect(gate.run("identity-overflow", async () => undefined)).rejects.toMatchObject({
      code: "AUTHENTICATION_BUSY"
    });
    const cancellationResult = expect(active).rejects.toBeInstanceOf(
      AuthenticationRequestCancelledError
    );
    passwordFailure.reject(new Error("synthetic late bcrypt rejection"));
    await cancellationResult;

    await expect(gate.run("identity-recovered", async () => "recovered")).resolves.toBe(
      "recovered"
    );
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

  it("retains the fixed lookup bound until abandoned operations settle", async () => {
    const gate = new LoginVerificationGate(4, 128, 128);
    const releaseLookups = deferred();
    const cancellations = Array.from({ length: 128 }, () => new AbortController());
    const lookups = cancellations.map((cancellation, index) =>
      gate.run(`unknown-${index}`, async () => releaseLookups.promise, cancellation.signal)
    );
    cancellations.forEach((cancellation) => cancellation.abort());

    await expect(gate.run("overflow", async () => undefined)).rejects.toMatchObject({
      statusCode: 429,
      code: "AUTHENTICATION_BUSY"
    });

    releaseLookups.resolve();
    const settlements = await Promise.allSettled(lookups);
    expect(
      settlements.every(
        (settlement) =>
          settlement.status === "rejected" &&
          settlement.reason instanceof AuthenticationRequestCancelledError
      )
    ).toBe(true);
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
