DROP INDEX IF EXISTS "shifts_companyId_teamId_status_startsAt_idx";

ALTER TABLE "shifts" DROP CONSTRAINT IF EXISTS "shifts_teamId_companyId_fkey";

ALTER TABLE "shifts" DROP COLUMN IF EXISTS "teamId";

CREATE INDEX "shifts_companyId_status_startsAt_idx" ON "shifts"("companyId", "status", "startsAt");
