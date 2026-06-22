DROP INDEX IF EXISTS "teams_companyId_name_key";

CREATE UNIQUE INDEX "teams_companyId_name_active_key"
  ON "teams"("companyId", "name")
  WHERE "deletedAt" IS NULL;
