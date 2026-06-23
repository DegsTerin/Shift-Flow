ALTER TABLE "refresh_tokens"
ADD COLUMN IF NOT EXISTS "companyId" UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'refresh_tokens_companyId_fkey'
  ) THEN
    ALTER TABLE "refresh_tokens"
    ADD CONSTRAINT "refresh_tokens_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "companies"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "refresh_tokens_companyId_expiresAt_revokedAt_idx"
ON "refresh_tokens"("companyId", "expiresAt", "revokedAt");
