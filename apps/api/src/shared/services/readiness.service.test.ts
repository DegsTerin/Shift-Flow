// en-GB: Exercises application behaviour so regressions at this boundary are detected automatically.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkReadiness } from "./readiness.service.js";

const { getPrisma, queryRaw } = vi.hoisted(() => ({
  getPrisma: vi.fn(),
  queryRaw: vi.fn()
}));

vi.mock("../lib/prisma.js", () => ({
  getPrisma
}));

const compatibleSchema = {
  relationsCompatible: true,
  migrationExists: true,
  migrationFinished: true,
  migrationNotRolledBack: true,
  sessionKindEnumCompatible: true,
  authenticationColumnsCompatible: true,
  observationsPrimaryKeyCompatible: true,
  observationsUserForeignKeyCompatible: true,
  observationsCompanyForeignKeyCompatible: true,
  indexesCompatible: true
};

beforeEach(() => {
  getPrisma.mockResolvedValue({
    $queryRaw: queryRaw
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  getPrisma.mockReset();
  queryRaw.mockReset();
});

describe("checkReadiness", () => {
  it("keeps database access disabled in test mode", async () => {
    vi.stubEnv("NODE_ENV", "test");

    await checkReadiness();

    expect(getPrisma).not.toHaveBeenCalled();
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it("accepts a completed and structurally compatible current schema", async () => {
    vi.stubEnv("NODE_ENV", "production");
    queryRaw.mockResolvedValue([compatibleSchema]);

    await checkReadiness();

    expect(queryRaw).toHaveBeenCalledTimes(1);
    const query = queryRaw.mock.calls[0]?.[0] as TemplateStringsArray;
    const sql = query.join("");
    expect(sql).toContain("20260903023000_add_authentication_session_observations");
    expect(sql).toContain("authentication_session_observations");
    expect(sql).toContain("sessionKind");
    expect(sql).toContain("familyId");
    expect(sql).toContain("user_role_assignments_active_exact_key");
    expect(sql).toContain("namespace.nspname = current_schema()");
    expect(sql).toContain("relation_class.relnamespace = active_schema.schema_oid");
    expect(sql).toContain("relation_class.relkind IN ('r', 'p')");
    expect(sql).toContain("pg_catalog.to_regclass");
    expect(sql).toContain("pg_catalog.quote_ident(required_relation.relation_name)");
    expect(sql).not.toContain("information_schema");
    for (const coreTable of [
      "_prisma_migrations",
      "audit_logs",
      "users",
      "user_companies",
      "companies",
      "access_token_revocations",
      "user_role_assignments",
      "roles",
      "role_permissions",
      "permissions",
      "refresh_tokens",
      "authentication_session_observations"
    ]) {
      expect(sql).toContain(`('${coreTable}')`);
    }
    for (const columnContract of [
      "('refresh_tokens', 'sessionKind', 'AuthenticationSessionKind', true, -1, true)",
      "('refresh_tokens', 'familyId', 'uuid', false, -1, true)",
      "('authentication_session_observations', 'id', 'uuid', false, -1, true)",
      "('authentication_session_observations', 'emailHash', 'varchar', false, 68, true)",
      "('authentication_session_observations', 'requestId', 'varchar', false, 124, false)",
      "('authentication_session_observations', 'ipAddress', 'varchar', false, 84, false)",
      "('authentication_session_observations', 'userAgent', 'text', false, -1, false)",
      "('authentication_session_observations', 'observedAt', 'timestamptz', false, 6, true)"
    ]) {
      expect(sql).toContain(columnContract);
    }
    for (const constraintName of [
      "authentication_session_observations_pkey",
      "authentication_session_observations_userId_fkey",
      "authentication_session_observations_companyId_fkey"
    ]) {
      expect(sql).toContain(constraintName);
    }
    for (const indexName of [
      "user_role_assignments_active_exact_key",
      "refresh_tokens_userId_companyId_sessionKind_expiresAt_revokedAt_idx",
      "refresh_tokens_userId_companyId_sessionKind_familyId_revokedAt_idx",
      "authentication_session_observations_userId_companyId_observedAt_idx",
      "authentication_session_observations_companyId_sessionKind_observedAt_idx"
    ]) {
      expect(sql).toContain(indexName);
    }
    expect(sql).toContain("ARRAY['PASSWORD', 'DEMO', 'PORTFOLIO']::text[]");
    expect(sql).toContain("primary_key.convalidated");
    expect(sql).toContain("user_foreign_key.confdeltype = 'c'");
    expect(sql).toContain("user_foreign_key.confupdtype = 'c'");
    expect(sql).toContain("company_foreign_key.confdeltype = 'c'");
    expect(sql).toContain("company_foreign_key.confupdtype = 'c'");
    expect(sql).toContain("index_metadata.indisunique = required_index.is_unique");
    expect(sql).toContain("index_metadata.indnullsnotdistinct");
    expect(sql).toContain("index_metadata.indisvalid");
    expect(sql).toContain("index_metadata.indisready");
    expect(sql).toContain("index_metadata.indislive");
    expect(sql).toContain("index_metadata.indnkeyatts");
    expect(sql).toContain("index_metadata.indnatts");
    expect(sql).toContain("pg_catalog.pg_get_indexdef");
    expect(sql).toContain("'\"deletedAt\"ISNULL'");
  });

  it("rejects a previous schema without the current migration", async () => {
    vi.stubEnv("NODE_ENV", "production");
    queryRaw.mockResolvedValue([
      {
        ...compatibleSchema,
        migrationExists: false,
        migrationFinished: false,
        migrationNotRolledBack: false
      }
    ]);

    await expect(checkReadiness()).rejects.toMatchObject({
      statusCode: 503,
      code: "READINESS_CHECK_FAILED",
      details: undefined
    });
  });

  it("rejects an unfinished current migration", async () => {
    vi.stubEnv("NODE_ENV", "production");
    queryRaw.mockResolvedValue([{ ...compatibleSchema, migrationFinished: false }]);

    await expect(checkReadiness()).rejects.toMatchObject({
      statusCode: 503,
      code: "READINESS_CHECK_FAILED",
      details: undefined
    });
  });

  it("rejects a rolled-back current migration", async () => {
    vi.stubEnv("NODE_ENV", "production");
    queryRaw.mockResolvedValue([{ ...compatibleSchema, migrationNotRolledBack: false }]);

    await expect(checkReadiness()).rejects.toMatchObject({
      statusCode: 503,
      code: "READINESS_CHECK_FAILED",
      details: undefined
    });
  });

  it.each([
    ["single-schema relation contract", "relationsCompatible"],
    ["session-kind enum contract", "sessionKindEnumCompatible"],
    ["authentication column contract", "authenticationColumnsCompatible"],
    ["observation primary key", "observationsPrimaryKeyCompatible"],
    ["observation user foreign key", "observationsUserForeignKeyCompatible"],
    ["observation company foreign key", "observationsCompanyForeignKeyCompatible"],
    ["required index contracts", "indexesCompatible"]
  ] as const)("rejects a schema without the %s", async (_name, field) => {
    vi.stubEnv("NODE_ENV", "production");
    queryRaw.mockResolvedValue([{ ...compatibleSchema, [field]: false }]);

    await expect(checkReadiness()).rejects.toMatchObject({
      statusCode: 503,
      code: "READINESS_CHECK_FAILED",
      details: undefined
    });
  });

  it("rejects an empty compatibility result", async () => {
    vi.stubEnv("NODE_ENV", "production");
    queryRaw.mockResolvedValue([]);

    await expect(checkReadiness()).rejects.toMatchObject({
      statusCode: 503,
      code: "READINESS_CHECK_FAILED",
      details: undefined
    });
  });

  it("raises a sanitised service-unavailable error when the database query fails", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const databaseError = new Error("relation private_schema is missing");
    queryRaw.mockRejectedValue(databaseError);

    await expect(checkReadiness()).rejects.toMatchObject({
      message: "Database readiness check failed",
      statusCode: 503,
      code: "READINESS_CHECK_FAILED",
      details: undefined,
      cause: databaseError
    });
  });

  it("sanitises Prisma acquisition failures before a query is available", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const acquisitionError = new Error("credential-bearing connector detail");
    getPrisma.mockRejectedValue(acquisitionError);

    await expect(checkReadiness()).rejects.toMatchObject({
      message: "Database readiness check failed",
      statusCode: 503,
      code: "READINESS_CHECK_FAILED",
      details: undefined,
      cause: acquisitionError
    });
    expect(queryRaw).not.toHaveBeenCalled();
  });
});
