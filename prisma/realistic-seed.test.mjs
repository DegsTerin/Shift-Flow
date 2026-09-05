// en-GB: Verifies that the real seed orchestration cleans and populates through one atomic transaction.
/* global structuredClone */
import { describe, expect, it, vi } from "vitest";
import { runRealisticSeed } from "./realistic-seed.mjs";
import { destructiveSeedTransactionOptions } from "./seed-safety.mjs";

function deferred() {
  let resolve;
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function cloneState(state) {
  return Object.fromEntries(
    Object.entries(state).map(([model, rows]) => [model, structuredClone(rows)])
  );
}

function createTransactionalHarness({ initialState = {}, failOn, holdCommit = false } = {}) {
  let committedState = cloneState(initialState);
  let nextId = 0;
  let transactionClient;
  const calls = [];
  const operationCompleted = deferred();
  const commitRelease = deferred();

  function createTransactionClient(state) {
    const database = new Proxy(
      {},
      {
        get: (_target, model) =>
          new Proxy(
            {},
            {
              get:
                (_modelTarget, method) =>
                async (argumentsValue = {}) => {
                  const operation = `${String(model)}.${String(method)}`;
                  calls.push({ client: database, operation });
                  if (operation === failOn) {
                    throw new Error(`Injected failure at ${operation}.`);
                  }

                  const rows = (state[model] ??= []);
                  if (method === "deleteMany") {
                    rows.splice(0, rows.length);
                    return { count: 0 };
                  }
                  if (method === "create") {
                    const record = { id: `${String(model)}-${++nextId}`, ...argumentsValue.data };
                    rows.push(record);
                    return structuredClone(record);
                  }
                  if (method === "createMany") {
                    const records = Array.isArray(argumentsValue.data)
                      ? argumentsValue.data
                      : [argumentsValue.data];
                    for (const data of records) {
                      rows.push({ id: `${String(model)}-${++nextId}`, ...data });
                    }
                    return { count: records.length };
                  }
                  if (method === "findMany") {
                    const where = argumentsValue.where ?? {};
                    return structuredClone(
                      rows.filter((row) =>
                        Object.entries(where).every(([key, value]) => row[key] === value)
                      )
                    );
                  }
                  if (method === "update") {
                    const record = rows.find((row) => row.id === argumentsValue.where.id);
                    if (!record) {
                      throw new Error(`Missing ${String(model)} row for update.`);
                    }
                    Object.assign(record, argumentsValue.data);
                    return structuredClone(record);
                  }
                  if (method === "count") {
                    return rows.length;
                  }

                  throw new Error(`Unsupported fake database operation ${operation}.`);
                }
            }
          )
      }
    );
    return database;
  }

  const databaseClient = {
    $transaction: vi.fn(async (operation) => {
      const workingState = cloneState(committedState);
      transactionClient = createTransactionClient(workingState);

      try {
        const result = await operation(transactionClient);
        operationCompleted.resolve();
        if (holdCommit) {
          await commitRelease.promise;
        }
        committedState = workingState;
        return result;
      } catch (error) {
        operationCompleted.resolve();
        throw error;
      }
    })
  };

  return {
    calls,
    databaseClient,
    operationCompleted: operationCompleted.promise,
    releaseCommit: commitRelease.resolve,
    get committedState() {
      return cloneState(committedState);
    },
    get transactionClient() {
      return transactionClient;
    }
  };
}

describe("atomic realistic seed", () => {
  it("runs the complete cleanup and population through one transaction before reporting success", async () => {
    const harness = createTransactionalHarness({
      initialState: { company: [{ id: "legacy-company" }] },
      holdCommit: true
    });
    const report = vi.fn();

    const pendingSeed = runRealisticSeed({
      databaseClient: harness.databaseClient,
      passwordHash: "already-hashed-password",
      adminEmail: "admin.operacoes@shiftflow.local",
      report
    });

    await harness.operationCompleted;
    expect(report).not.toHaveBeenCalled();
    expect(harness.calls.length).toBeGreaterThan(100);
    expect(harness.calls.every((call) => call.client === harness.transactionClient)).toBe(true);
    expect(harness.calls[0].operation).toBe("accessTokenRevocation.deleteMany");
    expect(harness.calls).toContainEqual({
      client: harness.transactionClient,
      operation: "company.deleteMany"
    });
    expect(harness.calls).toContainEqual({
      client: harness.transactionClient,
      operation: "company.create"
    });

    harness.releaseCommit();
    const result = await pendingSeed;

    expect(result.status).toBe("ok");
    expect(harness.committedState.company).toHaveLength(1);
    expect(harness.committedState.company[0].id).not.toBe("legacy-company");
    expect(report).toHaveBeenCalledOnce();
    expect(report).toHaveBeenCalledWith(result);
    expect(harness.databaseClient.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      destructiveSeedTransactionOptions
    );
  });

  it("rolls back the real cleanup and suppresses success when population fails", async () => {
    const initialState = {
      company: [{ id: "legacy-company" }],
      user: [{ id: "legacy-user" }]
    };
    const harness = createTransactionalHarness({ initialState, failOn: "company.create" });
    const report = vi.fn();

    await expect(
      runRealisticSeed({
        databaseClient: harness.databaseClient,
        passwordHash: "already-hashed-password",
        adminEmail: "admin.operacoes@shiftflow.local",
        report
      })
    ).rejects.toThrow("Injected failure at company.create");

    expect(harness.committedState).toEqual(initialState);
    expect(report).not.toHaveBeenCalled();
    expect(harness.calls.every((call) => call.client === harness.transactionClient)).toBe(true);
  });
});
