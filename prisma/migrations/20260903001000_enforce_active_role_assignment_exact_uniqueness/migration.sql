-- en-GB: Refuse to hide pre-existing ambiguity; repair affected assignments before retrying this migration.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "user_role_assignments"
    WHERE "deletedAt" IS NULL
    GROUP BY
      "companyId",
      "userId",
      "roleId",
      "clientId",
      "teamId",
      "startsAt",
      "endsAt"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Active role assignments contain duplicate exact intervals; repair the data before applying this migration.';
  END IF;
END
$$;

CREATE UNIQUE INDEX "user_role_assignments_active_exact_key"
  ON "user_role_assignments"(
    "companyId",
    "userId",
    "roleId",
    "clientId",
    "teamId",
    "startsAt",
    "endsAt"
  ) NULLS NOT DISTINCT
  WHERE "deletedAt" IS NULL;
