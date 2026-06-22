DROP INDEX IF EXISTS "clients_companyId_name_key";
DROP INDEX IF EXISTS "clients_companyId_code_key";

CREATE UNIQUE INDEX "clients_companyId_name_active_key"
  ON "clients"("companyId", "name")
  WHERE "deletedAt" IS NULL;

CREATE UNIQUE INDEX "clients_companyId_code_active_key"
  ON "clients"("companyId", "code")
  WHERE "deletedAt" IS NULL AND "code" IS NOT NULL;
