-- en-GB: Stores bounded authentication observations outside canonical append-only audit history.

CREATE TYPE "AuthenticationSessionKind" AS ENUM ('PASSWORD', 'DEMO', 'PORTFOLIO');

ALTER TABLE "refresh_tokens"
    ADD COLUMN "sessionKind" "AuthenticationSessionKind" NOT NULL DEFAULT 'PASSWORD';
ALTER TABLE "refresh_tokens" ADD COLUMN "familyId" UUID;
UPDATE "refresh_tokens" SET "familyId" = "id" WHERE "familyId" IS NULL;
ALTER TABLE "refresh_tokens" ALTER COLUMN "familyId" SET NOT NULL;
CREATE INDEX "refresh_tokens_userId_companyId_sessionKind_expiresAt_revokedAt_idx"
    ON "refresh_tokens"("userId", "companyId", "sessionKind", "expiresAt", "revokedAt");
CREATE INDEX "refresh_tokens_userId_companyId_sessionKind_familyId_revokedAt_idx"
    ON "refresh_tokens"("userId", "companyId", "sessionKind", "familyId", "revokedAt");

CREATE TABLE "authentication_session_observations" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "sessionKind" "AuthenticationSessionKind" NOT NULL,
    "emailHash" VARCHAR(64) NOT NULL,
    "requestId" VARCHAR(120),
    "ipAddress" VARCHAR(80),
    "userAgent" TEXT,
    "observedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "authentication_session_observations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "authentication_session_observations_userId_companyId_observedAt_idx"
    ON "authentication_session_observations"("userId", "companyId", "observedAt");
CREATE INDEX "authentication_session_observations_companyId_sessionKind_observedAt_idx"
    ON "authentication_session_observations"("companyId", "sessionKind", "observedAt");

ALTER TABLE "authentication_session_observations"
    ADD CONSTRAINT "authentication_session_observations_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "authentication_session_observations"
    ADD CONSTRAINT "authentication_session_observations_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
