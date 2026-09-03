// en-GB: Verifies HTTP login abuse controls and durable state against authorised PostgreSQL.
import { createHash, randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import process from "node:process";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
import express from "express";
import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createAuthController } from "../apps/api/src/modules/auth/auth.controller.ts";
import { AuthRepository } from "../apps/api/src/modules/auth/auth.repository.ts";
import { AuthService } from "../apps/api/src/modules/auth/auth.service.ts";
import {
  LoginFailureAuditGate,
  LoginFailureDelayGate,
  LoginVerificationGate
} from "../apps/api/src/modules/auth/login-verification-gate.ts";
import { loginSchema, refreshTokenSchema } from "../apps/api/src/modules/auth/auth.validators.ts";
import { errorHandler } from "../apps/api/src/shared/middlewares/error-handler.ts";
import { rateLimit, resetRateLimitBuckets } from "../apps/api/src/shared/middlewares/rate-limit.ts";
import { requestContext } from "../apps/api/src/shared/middlewares/request-context.ts";
import { validate } from "../apps/api/src/shared/middlewares/validate.ts";
import { assertSafePostgresIntegrationTarget } from "./seed-safety.mjs";

if (process.env.SHIFTFLOW_POSTGRES_INTEGRATION !== "1") {
  throw new Error(
    "SHIFTFLOW_POSTGRES_INTEGRATION=1 is required to run the dedicated PostgreSQL regression."
  );
}

function identifierHash(value) {
  return createHash("sha256").update(value).digest("hex");
}

function loginApplication(service) {
  const controller = createAuthController(service);
  const app = express();
  app.set("trust proxy", false);
  app.use(express.json());
  app.use(requestContext);
  app.use(rateLimit);
  app.post("/login", validate("body", loginSchema), controller.login);
  app.post("/refresh", validate("body", refreshTokenSchema), controller.refresh);
  app.use(errorHandler);
  return app;
}

function cookieHeader(value) {
  return Array.isArray(value) ? value.join("; ") : (value ?? "");
}

function sessionCookies(value) {
  const values = Array.isArray(value) ? value : [value].filter(Boolean);
  const pairs = values.map((entry) => entry.split(";", 1)[0]);
  const csrf = pairs.find((entry) => entry.startsWith("shiftflow_csrf="))?.slice(15);
  if (!csrf) throw new Error("Expected a CSRF cookie in the authentication response.");
  return { cookie: pairs.join("; "), csrf };
}

function apiRequest(ipAddress = "127.0.0.1") {
  return {
    context: {
      requestId: randomUUID(),
      userAgent: "PostgreSQL authentication regression",
      ipAddress
    }
  };
}

describe("authentication PostgreSQL integration", () => {
  const scope = randomUUID();
  const exactEmail = `Account-${scope}@shiftflow.local`;
  const alternateCaseEmail = exactEmail.toLowerCase();
  const companylessEmail = `Companyless-${scope}@shiftflow.local`;
  const unknownEmail = `Unknown-${scope}@shiftflow.local`;
  const password = `Integration!${scope}`;
  const state = {};
  let prisma;
  let repository;
  let app;
  let service;

  beforeAll(async () => {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL is required when SHIFTFLOW_POSTGRES_INTEGRATION=1.");
    }
    assertSafePostgresIntegrationTarget(connectionString, process.env.NODE_ENV, process.env.CI);

    const { PrismaClient } = await import("../generated/prisma/client.js");
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
    state.company = await prisma.company.create({ data: { name: `auth-${scope}` } });
    state.secondCompany = await prisma.company.create({ data: { name: `auth-second-${scope}` } });
    state.user = await prisma.user.create({
      data: {
        email: exactEmail,
        passwordHash: await bcrypt.hash(password, 12),
        displayName: "Authentication integration user",
        status: "ACTIVE"
      }
    });
    state.companylessUser = await prisma.user.create({
      data: {
        email: companylessEmail,
        passwordHash: await bcrypt.hash(password, 12),
        displayName: "Companyless integration user",
        status: "ACTIVE"
      }
    });
    await prisma.userCompany.create({
      data: { companyId: state.company.id, userId: state.user.id, isDefault: true }
    });
    await prisma.userCompany.create({
      data: { companyId: state.secondCompany.id, userId: state.user.id, isDefault: false }
    });

    repository = new AuthRepository(async () => prisma);
    service = new AuthService(
      repository,
      undefined,
      undefined,
      new LoginVerificationGate(1, 8, 8),
      undefined,
      new LoginFailureAuditGate(),
      new LoginFailureDelayGate()
    );
    app = loginApplication(service);
  }, 30_000);

  beforeEach(() => {
    resetRateLimitBuckets();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    resetRateLimitBuckets();
    if (!prisma) return;
    try {
      const userIds = [state.user?.id, state.companylessUser?.id].filter(Boolean);
      await prisma.refreshToken.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.authenticationSessionObservation.deleteMany({
        where: { userId: { in: userIds } }
      });
      await prisma.auditLog.deleteMany({ where: { actorUserId: { in: userIds } } });
      await prisma.authLoginAttempt.deleteMany({
        where: {
          emailHash: {
            in: [exactEmail, alternateCaseEmail, companylessEmail, unknownEmail].map(identifierHash)
          }
        }
      });
      await prisma.userCompany.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      if (state.company?.id) {
        await prisma.company.delete({ where: { id: state.company.id } });
      }
      if (state.secondCompany?.id) {
        await prisma.company.delete({ where: { id: state.secondCompany.id } });
      }
    } finally {
      await prisma.$disconnect();
    }
  }, 30_000);

  it("returns one public failure envelope and comparable timing before session issuance", async () => {
    const cases = [
      { email: unknownEmail, password: "wrong-password" },
      { email: exactEmail, password: "wrong-password" },
      { email: exactEmail, password, companyId: randomUUID() },
      { email: companylessEmail, password }
    ];
    const observations = [];

    for (const body of cases) {
      const startedAt = performance.now();
      const response = await request(app).post("/login").send(body);
      observations.push({ elapsedMs: performance.now() - startedAt, response });
    }

    const expectedEnvelope = {
      error: { code: "UNAUTHORIZED", message: "Invalid credentials" }
    };
    for (const observation of observations) {
      expect(observation.response.status).toBe(401);
      expect(observation.response.body).toEqual(expectedEnvelope);
      expect(observation.response.headers["x-request-id"]).toEqual(expect.any(String));
      expect(observation.response.headers["set-cookie"]).toBeUndefined();
      expect(observation.elapsedMs).toBeGreaterThanOrEqual(850);
    }
    const elapsed = observations.map((observation) => observation.elapsedMs);
    expect(Math.max(...elapsed) - Math.min(...elapsed)).toBeLessThan(1_500);

    expect(
      await prisma.authLoginAttempt.count({
        where: { emailHash: { in: [identifierHash(unknownEmail), identifierHash(exactEmail)] } }
      })
    ).toBe(0);
    expect(
      await prisma.auditLog.count({
        where: {
          entityId: { in: [identifierHash(unknownEmail), identifierHash(exactEmail)] },
          action: { in: ["LOGIN_FAILED", "LOGIN_THROTTLED"] }
        }
      })
    ).toBe(0);
  }, 30_000);

  it("keeps exact account identity coherent without durable state for case variants", async () => {
    const wrongCase = await request(app)
      .post("/login")
      .send({ email: alternateCaseEmail, password });
    expect(wrongCase.status).toBe(401);
    expect(wrongCase.body).toEqual({
      error: { code: "UNAUTHORIZED", message: "Invalid credentials" }
    });

    const exact = await request(app).post("/login").send({ email: exactEmail, password });
    expect(exact.status).toBe(200);
    expect(exact.body.data.user).toMatchObject({ id: state.user.id, email: exactEmail });
    expect(exact.body.data.refreshToken).toBeUndefined();
    const cookies = cookieHeader(exact.headers["set-cookie"]);
    expect(cookies).toContain("shiftflow_refresh=");
    expect(cookies).toContain("HttpOnly");
    expect(cookies).toContain("shiftflow_csrf=");

    const attempts = await prisma.authLoginAttempt.findMany({
      where: {
        emailHash: { in: [identifierHash(exactEmail), identifierHash(alternateCaseEmail)] }
      }
    });
    expect(attempts).toHaveLength(1);
    expect(attempts[0]).toMatchObject({
      emailHash: identifierHash(exactEmail),
      failedCount: 0,
      lastSuccessAt: expect.any(Date)
    });
  }, 30_000);

  it("replaces an oversized request id and persists the safe correlation value atomically", async () => {
    const suppliedRequestId = "x".repeat(121);
    const response = await request(app)
      .post("/login")
      .set("x-request-id", suppliedRequestId)
      .send({ email: exactEmail, password });

    expect(response.status).toBe(200);
    const requestId = response.headers["x-request-id"];
    expect(requestId).not.toBe(suppliedRequestId);
    expect(requestId).toMatch(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/);
    expect(
      await prisma.authenticationSessionObservation.findFirst({
        where: {
          userId: state.user.id,
          companyId: state.company.id,
          requestId
        }
      })
    ).toMatchObject({ emailHash: identifierHash(exactEmail), sessionKind: "PASSWORD" });
    expect(
      await prisma.auditLog.findFirst({
        where: {
          action: "LOGIN_SUCCESS",
          actorUserId: state.user.id,
          companyId: state.company.id,
          requestId
        }
      })
    ).toMatchObject({ entityId: identifierHash(exactEmail) });
  }, 30_000);

  it("rolls back the refresh token and returns no session when session observation fails", async () => {
    const scopeFilter = { userId: state.user.id, companyId: state.company.id };
    await prisma.refreshToken.deleteMany({ where: scopeFilter });
    const failingPrisma = new Proxy(prisma, {
      get(target, property, receiver) {
        if (property === "$transaction") {
          return (callback) =>
            target.$transaction(async (transaction) => {
              const authenticationSessionObservation = new Proxy(
                transaction.authenticationSessionObservation,
                {
                  get(delegate, delegateProperty, delegateReceiver) {
                    if (delegateProperty === "create") {
                      return async () => {
                        throw new Error("synthetic session observation failure");
                      };
                    }
                    const value = Reflect.get(delegate, delegateProperty, delegateReceiver);
                    return typeof value === "function" ? value.bind(delegate) : value;
                  }
                }
              );
              return callback(
                new Proxy(transaction, {
                  get(transactionTarget, transactionProperty, transactionReceiver) {
                    if (transactionProperty === "authenticationSessionObservation") {
                      return authenticationSessionObservation;
                    }
                    const value = Reflect.get(
                      transactionTarget,
                      transactionProperty,
                      transactionReceiver
                    );
                    return typeof value === "function" ? value.bind(transactionTarget) : value;
                  }
                })
              );
            });
        }
        return Reflect.get(target, property, receiver);
      }
    });
    const failingRepository = new AuthRepository(async () => failingPrisma);
    const failingApp = loginApplication(
      new AuthService(
        failingRepository,
        undefined,
        undefined,
        new LoginVerificationGate(1, 8, 8),
        async () => undefined,
        new LoginFailureAuditGate(),
        new LoginFailureDelayGate()
      )
    );

    const response = await request(failingApp).post("/login").send({ email: exactEmail, password });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      error: { code: "UNAUTHORIZED", message: "Invalid credentials" }
    });
    expect(response.headers["set-cookie"]).toBeUndefined();
    expect(await prisma.refreshToken.count({ where: scopeFilter })).toBe(0);
    expect(
      await prisma.authenticationSessionObservation.count({
        where: { requestId: response.headers["x-request-id"] }
      })
    ).toBe(0);
    expect(
      await prisma.auditLog.count({ where: { requestId: response.headers["x-request-id"] } })
    ).toBe(0);

    const failingDemoService = new AuthService(
      failingRepository,
      { enabled: true, email: exactEmail },
      undefined,
      new LoginVerificationGate(1, 8, 8),
      async () => undefined,
      new LoginFailureAuditGate(),
      new LoginFailureDelayGate()
    );
    await expect(failingDemoService.openDemoSession(apiRequest())).rejects.toThrow(
      "synthetic session observation failure"
    );
    expect(await prisma.refreshToken.count({ where: scopeFilter })).toBe(0);
  }, 30_000);

  it("rolls back password credentials when canonical login audit persistence fails", async () => {
    const scopeFilter = { userId: state.user.id, companyId: state.company.id };
    await prisma.refreshToken.deleteMany({ where: scopeFilter });
    const failingPrisma = new Proxy(prisma, {
      get(target, property, receiver) {
        if (property === "$transaction") {
          return (callback) =>
            target.$transaction(async (transaction) => {
              const auditLog = new Proxy(transaction.auditLog, {
                get(delegate, delegateProperty, delegateReceiver) {
                  if (delegateProperty === "create") {
                    return async (arguments_) => {
                      if (arguments_.data?.action === "LOGIN_SUCCESS") {
                        throw new Error("synthetic canonical login audit failure");
                      }
                      return delegate.create(arguments_);
                    };
                  }
                  const value = Reflect.get(delegate, delegateProperty, delegateReceiver);
                  return typeof value === "function" ? value.bind(delegate) : value;
                }
              });
              return callback(
                new Proxy(transaction, {
                  get(transactionTarget, transactionProperty, transactionReceiver) {
                    if (transactionProperty === "auditLog") return auditLog;
                    const value = Reflect.get(
                      transactionTarget,
                      transactionProperty,
                      transactionReceiver
                    );
                    return typeof value === "function" ? value.bind(transactionTarget) : value;
                  }
                })
              );
            });
        }
        return Reflect.get(target, property, receiver);
      }
    });
    const failingApp = loginApplication(
      new AuthService(
        new AuthRepository(async () => failingPrisma),
        undefined,
        undefined,
        new LoginVerificationGate(1, 8, 8),
        async () => undefined,
        new LoginFailureAuditGate(),
        new LoginFailureDelayGate()
      )
    );

    const response = await request(failingApp).post("/login").send({ email: exactEmail, password });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      error: { code: "UNAUTHORIZED", message: "Invalid credentials" }
    });
    expect(response.headers["set-cookie"]).toBeUndefined();
    expect(await prisma.refreshToken.count({ where: scopeFilter })).toBe(0);
    expect(
      await prisma.authenticationSessionObservation.count({
        where: { requestId: response.headers["x-request-id"] }
      })
    ).toBe(0);
    expect(
      await prisma.auditLog.count({ where: { requestId: response.headers["x-request-id"] } })
    ).toBe(0);
  }, 30_000);

  it("preserves one session row across repeated immediate HTTP session restores", async () => {
    const login = await request(app).post("/login").send({ email: exactEmail, password });
    expect(login.status).toBe(200);
    const initialCookies = sessionCookies(login.headers["set-cookie"]);
    const scopeFilter = { userId: state.user.id, companyId: state.company.id };
    const rowsAfterLogin = await prisma.refreshToken.count({ where: scopeFilter });

    const firstRestore = await request(app)
      .post("/refresh")
      .set("Cookie", initialCookies.cookie)
      .set("x-csrf-token", initialCookies.csrf)
      .send({});
    expect(firstRestore.status).toBe(200);
    const restoredCookies = sessionCookies(firstRestore.headers["set-cookie"]);
    const secondRestore = await request(app)
      .post("/refresh")
      .set("Cookie", restoredCookies.cookie)
      .set("x-csrf-token", restoredCookies.csrf)
      .send({});
    expect(secondRestore.status).toBe(200);

    expect(await prisma.refreshToken.count({ where: scopeFilter })).toBe(rowsAfterLogin);
  }, 30_000);

  it("keeps a correct credential usable after low-volume NAT spraying", async () => {
    const natApp = loginApplication(
      new AuthService(
        repository,
        undefined,
        undefined,
        new LoginVerificationGate(1, 16, 16),
        async () => undefined,
        new LoginFailureAuditGate(),
        new LoginFailureDelayGate()
      )
    );

    for (let index = 0; index < 10; index += 1) {
      const attack = await request(natApp)
        .post("/login")
        .send({ email: `spray-${index}-${scope}@shiftflow.local`, password: "wrong-password" });
      expect(attack.status).toBe(401);
    }

    const legitimate = await request(natApp).post("/login").send({ email: exactEmail, password });
    expect(legitimate.status).toBe(200);
    expect(cookieHeader(legitimate.headers["set-cookie"])).toContain("shiftflow_refresh=");
  }, 30_000);

  it("returns bounded HTTP 429 only while the same identity has bcrypt work scheduled", async () => {
    const bcryptStarted = Promise.withResolvers();
    const releaseBcrypt = Promise.withResolvers();
    const originalCompare = bcrypt.compare;
    const compare = vi.spyOn(bcrypt, "compare").mockImplementation(originalCompare);
    compare.mockImplementationOnce(async (...arguments_) => {
      bcryptStarted.resolve();
      await releaseBcrypt.promise;
      return originalCompare(...arguments_);
    });
    const blockingApp = loginApplication(
      new AuthService(
        repository,
        undefined,
        undefined,
        new LoginVerificationGate(1, 1, 1),
        undefined,
        new LoginFailureAuditGate(),
        new LoginFailureDelayGate()
      )
    );

    const admitted = request(blockingApp)
      .post("/login")
      .send({ email: exactEmail, password })
      .then((response) => response);
    await bcryptStarted.promise;

    const saturated = await request(blockingApp)
      .post("/login")
      .send({ email: exactEmail, password });
    expect(saturated.status).toBe(429);
    expect(saturated.body).toEqual({
      error: {
        code: "AUTHENTICATION_BUSY",
        message: "Authentication capacity is temporarily busy"
      }
    });
    expect(saturated.headers["x-request-id"]).toEqual(expect.any(String));
    expect(saturated.headers["retry-after"]).toBe("30");
    expect(saturated.headers["set-cookie"]).toBeUndefined();

    releaseBcrypt.resolve();
    expect((await admitted).status).toBe(200);
    const recovered = await request(blockingApp)
      .post("/login")
      .send({ email: exactEmail, password });
    expect(recovered.status).toBe(200);
    expect(cookieHeader(recovered.headers["set-cookie"])).toContain("shiftflow_refresh=");
  }, 30_000);

  it("admits a correct HTTP login while an earlier same-identity failure is still delayed", async () => {
    const delayStarted = Promise.withResolvers();
    const releaseDelay = Promise.withResolvers();
    const delayedApp = loginApplication(
      new AuthService(
        repository,
        undefined,
        undefined,
        new LoginVerificationGate(1, 8, 8),
        async () => {
          delayStarted.resolve();
          await releaseDelay.promise;
        },
        new LoginFailureAuditGate(),
        new LoginFailureDelayGate()
      )
    );
    let hostileSettled = false;
    const hostile = request(delayedApp)
      .post("/login")
      .send({ email: exactEmail, password: "wrong-password" })
      .then((response) => {
        hostileSettled = true;
        return response;
      });
    await delayStarted.promise;

    try {
      const legitimate = await request(delayedApp)
        .post("/login")
        .send({ email: exactEmail, password });
      expect(legitimate.status).toBe(200);
      expect(cookieHeader(legitimate.headers["set-cookie"])).toContain("shiftflow_refresh=");
      expect(hostileSettled).toBe(false);
    } finally {
      releaseDelay.resolve();
    }

    const failed = await hostile;
    expect(failed.status).toBe(401);
    expect(failed.body).toEqual({
      error: { code: "UNAUTHORIZED", message: "Invalid credentials" }
    });
  }, 30_000);

  it("serialises concurrent session creation and invalidates the displaced oldest session", async () => {
    const scopeFilter = {
      userId: state.user.id,
      companyId: state.company.id,
      sessionKind: "PASSWORD"
    };
    const credentialContext = {
      ...scopeFilter,
      passwordChangedAt: state.user.passwordChangedAt ?? null
    };
    await prisma.refreshToken.deleteMany({ where: scopeFilter });

    const oldestTokenHash = identifierHash(`oldest-${scope}`);
    await expect(
      repository.createRefreshToken(
        {
          ...scopeFilter,
          tokenHash: oldestTokenHash,
          familyId: randomUUID(),
          expiresAt: new Date(Date.now() + 86_400_000),
          createdAt: new Date("2020-01-01T00:00:00.000Z")
        },
        credentialContext,
        {
          sessionKind: "PASSWORD",
          emailHash: identifierHash(exactEmail),
          userId: state.user.id,
          companyId: state.company.id,
          requestId: `oldest-${scope}`
        }
      )
    ).resolves.toBe(true);

    const repositories = [repository, new AuthRepository(async () => prisma)];
    const created = await Promise.all(
      Array.from({ length: 12 }, (_, index) =>
        repositories[index % repositories.length].createRefreshToken(
          {
            ...scopeFilter,
            tokenHash: identifierHash(`concurrent-${scope}-${index}`),
            familyId: randomUUID(),
            expiresAt: new Date(Date.now() + 86_400_000)
          },
          credentialContext,
          {
            sessionKind: "PASSWORD",
            emailHash: identifierHash(exactEmail),
            userId: state.user.id,
            companyId: state.company.id,
            requestId: `concurrent-${index}-${scope}`
          }
        )
      )
    );

    expect(created).toEqual(new Array(12).fill(true));
    const retained = await prisma.refreshToken.findMany({ where: scopeFilter });
    expect(retained).toHaveLength(5);
    expect(retained.every((token) => token.revokedAt === null)).toBe(true);
    expect(
      await prisma.refreshToken.findUnique({ where: { tokenHash: oldestTokenHash } })
    ).toBeNull();
  }, 30_000);

  it("retains consumed tokens through expiry so old-token reuse revokes later successors", async () => {
    const scopeFilter = { userId: state.user.id, companyId: state.company.id };
    await prisma.refreshToken.deleteMany({ where: scopeFilter });
    const initial = await service.login(apiRequest(), { email: exactEmail, password });
    const firstToken = initial.refreshToken;
    let currentToken = firstToken;

    for (let generation = 0; generation < 7; generation += 1) {
      await prisma.refreshToken.update({
        where: { tokenHash: identifierHash(currentToken) },
        data: { createdAt: new Date(Date.now() - 120_000) }
      });
      currentToken = (await service.refresh(apiRequest(), currentToken)).refreshToken;
    }

    await expect(service.refresh(apiRequest(), firstToken)).rejects.toMatchObject({
      code: "UNAUTHORIZED",
      message: "Invalid refresh token"
    });
    expect(
      await prisma.refreshToken.findUnique({ where: { tokenHash: identifierHash(currentToken) } })
    ).toMatchObject({ revokedAt: expect.any(Date) });
  }, 30_000);

  it("serialises compromise revocation after an overlapping session creation", async () => {
    const scopeFilter = { userId: state.user.id, companyId: state.company.id };
    const credentialContext = {
      ...scopeFilter,
      sessionKind: "PASSWORD",
      passwordChangedAt: state.user.passwordChangedAt ?? null
    };
    await prisma.refreshToken.deleteMany({ where: scopeFilter });
    const createReached = Promise.withResolvers();
    const releaseCreate = Promise.withResolvers();
    const blockingPrisma = new Proxy(prisma, {
      get(target, property, receiver) {
        if (property === "$transaction") {
          return (callback) =>
            target.$transaction(async (transaction) => {
              const refreshToken = new Proxy(transaction.refreshToken, {
                get(delegate, delegateProperty, delegateReceiver) {
                  if (delegateProperty === "create") {
                    return async (arguments_) => {
                      createReached.resolve();
                      await releaseCreate.promise;
                      return delegate.create(arguments_);
                    };
                  }
                  const value = Reflect.get(delegate, delegateProperty, delegateReceiver);
                  return typeof value === "function" ? value.bind(delegate) : value;
                }
              });
              return callback(
                new Proxy(transaction, {
                  get(transactionTarget, transactionProperty, transactionReceiver) {
                    if (transactionProperty === "refreshToken") return refreshToken;
                    const value = Reflect.get(
                      transactionTarget,
                      transactionProperty,
                      transactionReceiver
                    );
                    return typeof value === "function" ? value.bind(transactionTarget) : value;
                  }
                })
              );
            });
        }
        return Reflect.get(target, property, receiver);
      }
    });
    const blockingRepository = new AuthRepository(async () => blockingPrisma);
    const overlapFamilyId = randomUUID();
    const creating = blockingRepository.createRefreshToken(
      {
        ...scopeFilter,
        tokenHash: identifierHash(`overlap-${scope}`),
        familyId: overlapFamilyId,
        expiresAt: new Date(Date.now() + 86_400_000)
      },
      credentialContext,
      {
        sessionKind: "PASSWORD",
        emailHash: identifierHash(exactEmail),
        userId: state.user.id,
        companyId: state.company.id,
        requestId: `overlap-${scope}`
      }
    );
    await createReached.promise;
    const revoking = repository.revokeActiveRefreshTokenFamily(
      state.user.id,
      state.company.id,
      "PASSWORD",
      overlapFamilyId
    );

    releaseCreate.resolve();
    await expect(creating).resolves.toBe(true);
    await revoking;
    expect(await prisma.refreshToken.count({ where: { ...scopeFilter, revokedAt: null } })).toBe(0);
  }, 30_000);

  it("retains bounded attributable observations without pruning canonical audit history", async () => {
    const emailHash = identifierHash(exactEmail);
    const companyIds = [state.company.id, state.secondCompany.id];
    await prisma.authenticationSessionObservation.deleteMany({
      where: { userId: state.user.id, companyId: { in: companyIds } }
    });
    const legacy = await prisma.auditLog.create({
      data: {
        entityType: "Auth",
        entityId: emailHash,
        action: "LOGIN_SUCCESS",
        actorUserId: state.user.id,
        companyId: state.company.id,
        requestId: `legacy-${scope}`
      }
    });
    const credentialContext = {
      userId: state.user.id,
      companyId: state.company.id,
      sessionKind: "PASSWORD",
      passwordChangedAt: state.user.passwordChangedAt ?? null
    };
    const repositories = [repository, new AuthRepository(async () => prisma)];

    const concurrent = await Promise.all(
      Array.from({ length: 30 }, (_, index) =>
        repositories[index % repositories.length].createRefreshToken(
          {
            tokenHash: identifierHash(`observation-${scope}-${index}`),
            familyId: randomUUID(),
            expiresAt: new Date(Date.now() + 86_400_000)
          },
          credentialContext,
          {
            sessionKind: "PASSWORD",
            emailHash,
            userId: state.user.id,
            companyId: state.company.id,
            requestId: `password-${index}-${scope}`,
            ipAddress: `192.0.2.${index + 1}`,
            ipHash: identifierHash(`192.0.2.${index + 1}`),
            userAgent: `bounded-password-${index}`
          }
        )
      )
    );
    expect(concurrent).toEqual(new Array(30).fill(true));

    const retainedPassword = await prisma.authenticationSessionObservation.findMany({
      where: {
        userId: state.user.id,
        companyId: state.company.id,
        sessionKind: "PASSWORD"
      }
    });
    expect(retainedPassword).toHaveLength(20);
    expect(
      retainedPassword.every(
        (entry) =>
          entry.sessionKind === "PASSWORD" &&
          entry.emailHash === emailHash &&
          entry.requestId?.startsWith("password-") &&
          entry.ipAddress?.startsWith("192.0.2.") &&
          entry.userAgent?.startsWith("bounded-password-")
      )
    ).toBe(true);
    const concurrentPasswordAudits = {
      action: "LOGIN_SUCCESS",
      actorUserId: state.user.id,
      companyId: state.company.id,
      requestId: { startsWith: "password-" }
    };
    expect(await prisma.auditLog.count({ where: concurrentPasswordAudits })).toBe(30);

    for (const [index, sessionKind] of ["PASSWORD", "DEMO", "PORTFOLIO"].entries()) {
      await expect(
        repository.createRefreshToken(
          {
            tokenHash: identifierHash(`kind-${sessionKind}-${scope}`),
            familyId: randomUUID(),
            expiresAt: new Date(Date.now() + 86_400_000)
          },
          {
            ...credentialContext,
            companyId: state.secondCompany.id,
            sessionKind
          },
          {
            sessionKind,
            emailHash,
            userId: state.user.id,
            companyId: state.secondCompany.id,
            requestId: `kind-${index}-${scope}`,
            ipAddress: `198.51.100.${index + 1}`,
            ipHash: identifierHash(`198.51.100.${index + 1}`),
            userAgent: `bounded-${sessionKind.toLowerCase()}`
          }
        )
      ).resolves.toBe(true);
    }
    const auditCountBeforePortfolioFlood = await prisma.auditLog.count({
      where: {
        action: "LOGIN_SUCCESS",
        actorUserId: state.user.id,
        companyId: state.secondCompany.id
      }
    });
    for (let index = 0; index < 25; index += 1) {
      await expect(
        repository.createRefreshToken(
          {
            tokenHash: identifierHash(`portfolio-observation-${index}-${scope}`),
            familyId: randomUUID(),
            expiresAt: new Date(Date.now() + 86_400_000)
          },
          {
            ...credentialContext,
            companyId: state.secondCompany.id,
            sessionKind: "PORTFOLIO"
          },
          {
            sessionKind: "PORTFOLIO",
            emailHash,
            userId: state.user.id,
            companyId: state.secondCompany.id,
            requestId: `portfolio-${index}-${scope}`,
            ipAddress: `203.0.113.${index + 1}`,
            ipHash: identifierHash(`203.0.113.${index + 1}`),
            userAgent: `bounded-portfolio-${index}`
          }
        )
      ).resolves.toBe(true);
    }
    expect(
      await prisma.auditLog.count({
        where: {
          action: "LOGIN_SUCCESS",
          actorUserId: state.user.id,
          companyId: state.secondCompany.id
        }
      })
    ).toBe(auditCountBeforePortfolioFlood);
    expect(await prisma.auditLog.count({ where: concurrentPasswordAudits })).toBe(30);
    const retainedKinds = await prisma.authenticationSessionObservation.findMany({
      where: { userId: state.user.id, companyId: state.secondCompany.id },
      orderBy: [{ sessionKind: "asc" }, { observedAt: "asc" }]
    });
    expect(retainedKinds.filter((entry) => entry.sessionKind === "PASSWORD")).toHaveLength(1);
    expect(retainedKinds.filter((entry) => entry.sessionKind === "DEMO")).toHaveLength(1);
    expect(retainedKinds.filter((entry) => entry.sessionKind === "PORTFOLIO")).toHaveLength(20);
    expect(await prisma.auditLog.findUnique({ where: { id: legacy.id } })).toMatchObject({
      action: "LOGIN_SUCCESS",
      requestId: `legacy-${scope}`
    });
  }, 60_000);

  it("isolates password refresh sessions from portfolio caps and class revocation", async () => {
    const scopeFilter = { userId: state.user.id, companyId: state.company.id };
    const emailHash = identifierHash(exactEmail);
    await prisma.refreshToken.deleteMany({ where: scopeFilter });
    const passwordHash = identifierHash(`password-isolation-${scope}`);
    const passwordFamilyId = randomUUID();
    await expect(
      repository.createRefreshToken(
        {
          tokenHash: passwordHash,
          familyId: passwordFamilyId,
          expiresAt: new Date(Date.now() + 86_400_000)
        },
        {
          ...scopeFilter,
          sessionKind: "PASSWORD",
          passwordChangedAt: state.user.passwordChangedAt ?? null
        },
        {
          ...scopeFilter,
          sessionKind: "PASSWORD",
          emailHash,
          requestId: `password-isolation-${scope}`
        }
      )
    ).resolves.toBe(true);

    const portfolioFamilyIds = Array.from({ length: 8 }, () => randomUUID());
    for (let index = 0; index < portfolioFamilyIds.length; index += 1) {
      await expect(
        repository.createRefreshToken(
          {
            tokenHash: identifierHash(`portfolio-isolation-${index}-${scope}`),
            familyId: portfolioFamilyIds[index],
            expiresAt: new Date(Date.now() + 86_400_000)
          },
          {
            ...scopeFilter,
            sessionKind: "PORTFOLIO",
            passwordChangedAt: state.user.passwordChangedAt ?? null
          },
          {
            ...scopeFilter,
            sessionKind: "PORTFOLIO",
            emailHash,
            requestId: `portfolio-isolation-${index}-${scope}`
          }
        )
      ).resolves.toBe(true);
    }

    expect(
      await prisma.refreshToken.findUnique({ where: { tokenHash: passwordHash } })
    ).toMatchObject({ revokedAt: null, sessionKind: "PASSWORD" });
    expect(
      await prisma.refreshToken.count({ where: { ...scopeFilter, sessionKind: "PORTFOLIO" } })
    ).toBe(8);

    await repository.revokeActiveRefreshTokenFamily(
      state.user.id,
      state.company.id,
      "PORTFOLIO",
      portfolioFamilyIds[0]
    );
    expect(
      await prisma.refreshToken.findUnique({ where: { tokenHash: passwordHash } })
    ).toMatchObject({ revokedAt: null, sessionKind: "PASSWORD" });
    expect(
      await prisma.refreshToken.count({
        where: { ...scopeFilter, sessionKind: "PORTFOLIO", revokedAt: null }
      })
    ).toBe(7);
  }, 30_000);

  it("increments one durable principal row monotonically across repository instances", async () => {
    const emailHash = identifierHash(exactEmail);
    await prisma.authLoginAttempt.deleteMany({ where: { emailHash } });
    const firstRepository = new AuthRepository(async () => prisma);
    const secondRepository = new AuthRepository(async () => prisma);
    const operations = Array.from({ length: 12 }, (_, index) =>
      (index % 2 === 0 ? firstRepository : secondRepository).recordFailedLogin({
        emailHash,
        maxAttempts: 100,
        lockoutWindowMs: 900_000,
        ipHash: identifierHash(`192.0.2.${index}`),
        userAgent: "PostgreSQL concurrency regression"
      })
    );

    const outcomes = await Promise.all(operations);
    expect(
      outcomes.map((outcome) => outcome.failedCount).sort((left, right) => left - right)
    ).toEqual(Array.from({ length: 12 }, (_, index) => index + 1));
    expect(await prisma.authLoginAttempt.findUnique({ where: { emailHash } })).toMatchObject({
      failedCount: 12
    });
  }, 30_000);
});
