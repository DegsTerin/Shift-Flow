-- Persist access-token revocation and login lockout state for authentication hardening.

CREATE TABLE "access_token_revocations" (
    "id" UUID NOT NULL,
    "jwtId" VARCHAR(120) NOT NULL,
    "userId" UUID,
    "expiresAt" TIMESTAMPTZ(6) NOT NULL,
    "revokedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "requestId" VARCHAR(120),
    "ipAddress" VARCHAR(80),
    "userAgent" TEXT,

    CONSTRAINT "access_token_revocations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "auth_login_attempts" (
    "id" UUID NOT NULL,
    "emailHash" VARCHAR(64) NOT NULL,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMPTZ(6),
    "lastFailureAt" TIMESTAMPTZ(6),
    "lastSuccessAt" TIMESTAMPTZ(6),
    "ipHash" VARCHAR(64),
    "userAgent" TEXT,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_login_attempts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "access_token_revocations_jwtId_key" ON "access_token_revocations"("jwtId");
CREATE INDEX "access_token_revocations_userId_expiresAt_idx" ON "access_token_revocations"("userId", "expiresAt");
CREATE INDEX "access_token_revocations_expiresAt_idx" ON "access_token_revocations"("expiresAt");

CREATE UNIQUE INDEX "auth_login_attempts_emailHash_key" ON "auth_login_attempts"("emailHash");
CREATE INDEX "auth_login_attempts_lockedUntil_idx" ON "auth_login_attempts"("lockedUntil");
