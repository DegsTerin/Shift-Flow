// en-GB: Provides per-identity admission and a fixed global budget for expensive password work.
import crypto from "node:crypto";
import { AppError } from "../../shared/errors/app-error.js";

type PasswordBudgetOperation = <T>(operation: () => Promise<T>) => Promise<T>;

type QueuedPasswordOperation<T> = {
  operation: () => Promise<T>;
  reject: (error: unknown) => void;
  resolve: (result: T) => void;
};

const defaultMaximumConcurrentPasswordChecks = 4;
const defaultMaximumActiveIdentities = 128;
const defaultMaximumQueuedPasswordChecks = 128;
const defaultUnknownAuditWindowMs = 60_000;
const defaultUnknownBackoffBuckets = 256;
const maximumAggregatedEventCount = 2_147_483_647;
export const authenticationBackoffMaximumMs = 30_000;
const authenticationBackoffBaseMs = 1_000;

export function authenticationBackoffMs(failedCount: number, threshold: number) {
  const exponent = Math.min(Math.max(failedCount - threshold, 0), 20);
  return Math.min(authenticationBackoffBaseMs * 2 ** exponent, authenticationBackoffMaximumMs);
}

function authenticationBusy() {
  return new AppError(
    "Authentication capacity is temporarily busy",
    429,
    "AUTHENTICATION_BUSY",
    undefined,
    30
  );
}

/** Admits one operation per identity and schedules bcrypt work through one global FIFO budget. */
export class LoginVerificationGate {
  private readonly activeIdentities = new Set<string>();
  private readonly passwordQueue: Array<QueuedPasswordOperation<unknown>> = [];
  private activePasswordChecks = 0;

  constructor(
    private readonly maximumConcurrentPasswordChecks = defaultMaximumConcurrentPasswordChecks,
    private readonly maximumActiveIdentities = defaultMaximumActiveIdentities,
    private readonly maximumQueuedPasswordChecks = defaultMaximumQueuedPasswordChecks
  ) {
    for (const [name, value] of [
      ["password concurrency", maximumConcurrentPasswordChecks],
      ["active identity capacity", maximumActiveIdentities],
      ["password queue capacity", maximumQueuedPasswordChecks]
    ] as const) {
      if (!Number.isSafeInteger(value) || value < 1) {
        throw new Error(`Login verification ${name} must be a positive integer`);
      }
    }
  }

  async run<T>(
    key: string,
    operation: (withPasswordBudget: PasswordBudgetOperation) => Promise<T>
  ): Promise<T> {
    if (
      this.activeIdentities.has(key) ||
      this.activeIdentities.size >= this.maximumActiveIdentities
    ) {
      throw authenticationBusy();
    }

    this.activeIdentities.add(key);
    try {
      return await operation((passwordOperation) => this.withPasswordBudget(passwordOperation));
    } finally {
      this.activeIdentities.delete(key);
    }
  }

  private withPasswordBudget<T>(operation: () => Promise<T>): Promise<T> {
    if (this.activePasswordChecks < this.maximumConcurrentPasswordChecks) {
      return this.startPasswordOperation(operation);
    }
    if (this.passwordQueue.length >= this.maximumQueuedPasswordChecks) {
      return Promise.reject(authenticationBusy());
    }

    return new Promise<T>((resolve, reject) => {
      this.passwordQueue.push({ operation, resolve, reject } as QueuedPasswordOperation<unknown>);
    });
  }

  private async startPasswordOperation<T>(operation: () => Promise<T>): Promise<T> {
    this.activePasswordChecks += 1;
    try {
      return await operation();
    } finally {
      this.activePasswordChecks -= 1;
      const queued = this.passwordQueue.shift();
      if (queued) {
        this.startPasswordOperation(queued.operation).then(queued.resolve, queued.reject);
      }
    }
  }
}

type LoginFailureKind = "known" | "unknown";
type FailureAggregate = { pendingFailures: number; nextEmissionAt?: number };

/** Coalesces login failures into two fixed process-wide telemetry samples. */
export class LoginFailureAuditGate {
  private readonly aggregates: Record<LoginFailureKind, FailureAggregate> = {
    known: { pendingFailures: 0 },
    unknown: { pendingFailures: 0 }
  };

  constructor(
    private readonly windowMs = defaultUnknownAuditWindowMs,
    private readonly now: () => number = Date.now
  ) {
    if (!Number.isSafeInteger(windowMs) || windowMs < 1) {
      throw new Error("Login-failure audit window must be a positive integer");
    }
  }

  takeAggregate(kind: LoginFailureKind): number | undefined {
    const aggregate = this.aggregates[kind];
    aggregate.pendingFailures = Math.min(
      aggregate.pendingFailures + 1,
      maximumAggregatedEventCount
    );
    const observedAt = this.now();
    if (aggregate.nextEmissionAt !== undefined && observedAt < aggregate.nextEmissionAt) {
      return undefined;
    }

    const attemptCount = aggregate.pendingFailures;
    aggregate.pendingFailures = 0;
    aggregate.nextEmissionAt = observedAt + this.windowMs;
    return attemptCount;
  }
}

/** Coalesces successful logins into one fixed process-wide telemetry sample. */
export class LoginSuccessTelemetryGate {
  private pendingSuccesses = 0;
  private nextEmissionAt?: number;

  constructor(
    private readonly windowMs = defaultUnknownAuditWindowMs,
    private readonly now: () => number = Date.now
  ) {
    if (!Number.isSafeInteger(windowMs) || windowMs < 1) {
      throw new Error("Login-success telemetry window must be a positive integer");
    }
  }

  takeAggregate(): number | undefined {
    this.pendingSuccesses = Math.min(this.pendingSuccesses + 1, maximumAggregatedEventCount);
    const observedAt = this.now();
    if (this.nextEmissionAt !== undefined && observedAt < this.nextEmissionAt) {
      return undefined;
    }

    const successCount = this.pendingSuccesses;
    this.pendingSuccesses = 0;
    this.nextEmissionAt = observedAt + this.windowMs;
    return successCount;
  }
}

type UnknownBackoffBucket = {
  failedCount: number;
  lastFailureAt: number;
  lockedUntil?: number;
};

/** Gives unknown principals equivalent bounded backoff without attacker-cardinality storage. */
export class UnknownLoginBackoffGate {
  private readonly buckets: Array<UnknownBackoffBucket | undefined>;

  constructor(
    bucketCount = defaultUnknownBackoffBuckets,
    private readonly secret: Uint8Array = crypto.randomBytes(32),
    private readonly now: () => number = Date.now
  ) {
    if (!Number.isSafeInteger(bucketCount) || bucketCount < 1) {
      throw new Error("Unknown-login backoff bucket count must be a positive integer");
    }
    if (secret.byteLength < 32) {
      throw new Error("Unknown-login backoff secret must contain at least 32 bytes");
    }
    this.buckets = new Array<UnknownBackoffBucket | undefined>(bucketCount);
  }

  currentBackoffUntil(key: string, windowMs: number): Date | undefined {
    const index = this.bucketIndex(key);
    const bucket = this.currentBucket(index, windowMs);
    return bucket?.lockedUntil === undefined ? undefined : new Date(bucket.lockedUntil);
  }

  recordFailure(key: string, threshold: number, windowMs: number): Date | undefined {
    const observedAt = this.now();
    const index = this.bucketIndex(key);
    const current = this.currentBucket(index, windowMs);
    const failedCount = (current?.failedCount ?? 0) + 1;
    const lockedUntil =
      failedCount < threshold
        ? undefined
        : observedAt + authenticationBackoffMs(failedCount, threshold);
    this.buckets[index] = { failedCount, lastFailureAt: observedAt, lockedUntil };
    return lockedUntil === undefined ? undefined : new Date(lockedUntil);
  }

  private currentBucket(index: number, windowMs: number) {
    const bucket = this.buckets[index];
    if (bucket && this.now() - bucket.lastFailureAt >= windowMs) {
      this.buckets[index] = undefined;
      return undefined;
    }
    return bucket;
  }

  private bucketIndex(key: string) {
    const digest = crypto.createHmac("sha256", this.secret).update(key).digest();
    return digest.readUInt32BE(0) % this.buckets.length;
  }
}

export const loginVerificationGate = new LoginVerificationGate();
export const loginFailureAuditGate = new LoginFailureAuditGate();
export const loginSuccessTelemetryGate = new LoginSuccessTelemetryGate();
export const unknownLoginBackoffGate = new UnknownLoginBackoffGate();
