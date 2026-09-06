// en-GB: Builds and probes strictly derived PostgreSQL readiness fixtures inside the disposable strangler runtime.
/* global AbortSignal, URL, console, fetch, process */
import pg from "pg";
import { setTimeout as delay } from "node:timers/promises";

const { Client } = pg;

const DISPOSABLE_SENTINEL = "CONFIRMED_DISPOSABLE_STRANGLER";
const REQUIRED_MIGRATION = "20260903023000_add_authentication_session_observations";
const RUN_ID_PATTERN = /^[0-9a-f]{24}$/;
const GENERATED_DATABASE_PATTERN = /^sf_readiness_[0-9a-f]{24}_(?:template|case_(?:0[0-9]|10))$/;
const GENERATED_CONTAINER_PATTERN = /^sf-readiness-[0-9a-f]{24}-(?:node|dotnet)-(?:0[0-9]|10)$/;
const IDENTIFIER_PATTERN = /^[a-z_][a-z0-9_]*$/;
const RESPONSE_LIMIT = 1_500;
const PROBE_ATTEMPTS = 60;
const PROBE_DELAY_MS = 500;
const NEGATIVE_CONFIRMATION_SAMPLES = 5;

const scenarios = Object.freeze([
  "fully-migrated",
  "current-migration-absent",
  "current-ledger-unfinished",
  "current-ledger-rolled-back",
  "split-decoy-schema",
  "core-table-view",
  "rbac-index-wrong-owner",
  "rbac-index-wrong-definition",
  "auth-column-malformed",
  "auth-constraints-malformed",
  "auth-index-malformed"
]);

const hosts = Object.freeze({
  "legacy-api": Object.freeze({ token: "node", port: 3001, service: "shiftflow-api" }),
  "api-dotnet": Object.freeze({ token: "dotnet", port: 8080, service: "shiftflow-api-dotnet" })
});

function parseArguments(argv) {
  if (argv.length === 0 || argv.length % 2 !== 0) {
    throw new Error("Named readiness runtime arguments are required in key/value pairs.");
  }

  const parsed = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!/^--[a-z][a-z-]*$/.test(key) || value.startsWith("--") || parsed.has(key)) {
      throw new Error("Readiness runtime arguments contain an invalid or duplicate key.");
    }
    parsed.set(key, value);
  }

  const action = parsed.get("--action");
  const expectedKeys = {
    "create-template": ["--action", "--run-id"],
    "create-scenario": ["--action", "--run-id", "--scenario"],
    probe: ["--action", "--run-id", "--scenario", "--host"]
  }[action];
  if (
    !expectedKeys ||
    parsed.size !== expectedKeys.length ||
    expectedKeys.some((key) => !parsed.has(key))
  ) {
    throw new Error("Readiness runtime arguments do not match an allowed action contract.");
  }

  return Object.freeze({
    action,
    runId: parsed.get("--run-id"),
    scenario: parsed.get("--scenario"),
    host: parsed.get("--host")
  });
}

function requireDisposableAuthority() {
  if (process.env.SHIFTFLOW_DISPOSABLE_RUNTIME !== DISPOSABLE_SENTINEL) {
    throw new Error("Disposable strangler runtime authority is required.");
  }
}

function requireRunId(runId) {
  if (!RUN_ID_PATTERN.test(runId ?? "")) {
    throw new Error("The readiness run id must be exactly 24 lower-case hexadecimal characters.");
  }
  return runId;
}

function requireScenario(scenario) {
  const index = scenarios.indexOf(scenario);
  if (index < 0) {
    throw new Error("The readiness scenario is not in the frozen scenario set.");
  }
  return index;
}

function requireHost(host) {
  if (!Object.hasOwn(hosts, host ?? "")) {
    throw new Error("The readiness host is not in the frozen host set.");
  }
  return hosts[host];
}

function templateDatabaseName(runId) {
  return `sf_readiness_${runId}_template`;
}

function scenarioDatabaseName(runId, scenario) {
  const index = requireScenario(scenario).toString().padStart(2, "0");
  return `sf_readiness_${runId}_case_${index}`;
}

function hostContainerName(runId, scenario, host) {
  const index = requireScenario(scenario).toString().padStart(2, "0");
  const contract = requireHost(host);
  const name = `sf-readiness-${runId}-${contract.token}-${index}`;
  if (!GENERATED_CONTAINER_PATTERN.test(name)) {
    throw new Error("The derived readiness container name is outside the disposable boundary.");
  }
  return name;
}

function quoteIdentifier(identifier) {
  if (!IDENTIFIER_PATTERN.test(identifier)) {
    throw new Error("A generated PostgreSQL identifier failed strict validation.");
  }
  return `"${identifier.replaceAll('"', '""')}"`;
}

function quoteGeneratedDatabase(databaseName) {
  if (!GENERATED_DATABASE_PATTERN.test(databaseName)) {
    throw new Error("The derived database name is outside the disposable boundary.");
  }
  return quoteIdentifier(databaseName);
}

function controlledDatabaseUrl(expectedDatabase = "shiftflow") {
  const rawDatabaseUrl = process.env.DATABASE_URL;
  if (!rawDatabaseUrl) {
    throw new Error("A controlled DATABASE_URL is required.");
  }

  let databaseUrl;
  try {
    databaseUrl = new URL(rawDatabaseUrl);
  } catch {
    throw new Error("The controlled DATABASE_URL is not a valid absolute URL.");
  }

  const databaseName = decodeURIComponent(databaseUrl.pathname.slice(1));
  const userName = decodeURIComponent(databaseUrl.username);
  const password = decodeURIComponent(databaseUrl.password);
  if (
    databaseUrl.protocol !== "postgresql:" ||
    databaseUrl.hostname !== "postgres" ||
    databaseUrl.port !== "5432" ||
    databaseUrl.username !== "shiftflow" ||
    userName !== "shiftflow" ||
    !/^Pg!aA1-[0-9A-F]{48}$/.test(password) ||
    databaseName !== expectedDatabase ||
    databaseUrl.pathname !== `/${encodeURIComponent(expectedDatabase)}` ||
    databaseUrl.search !== "?schema=public" ||
    databaseUrl.hash !== ""
  ) {
    throw new Error("DATABASE_URL is outside the controlled disposable PostgreSQL boundary.");
  }

  return databaseUrl;
}

function databaseUrlFor(baseUrl, databaseName) {
  if (!GENERATED_DATABASE_PATTERN.test(databaseName)) {
    throw new Error("A generated scenario database name failed validation.");
  }
  const url = new URL(baseUrl.href);
  url.pathname = `/${databaseName}`;
  url.search = "?schema=public";
  return url;
}

function failureMessage(error) {
  return (error instanceof Error ? error.message : String(error)).slice(0, RESPONSE_LIMIT / 2);
}

function preservePrimaryFailure(primaryError, secondaryError, secondaryContext) {
  return new AggregateError(
    [primaryError, secondaryError],
    `${failureMessage(primaryError)}; secondary ${secondaryContext}: ${failureMessage(secondaryError)}`
  );
}

async function withClient(connectionUrl, databaseName, operation) {
  const client = new Client({ connectionString: connectionUrl.href });
  await client.connect();
  let operationResult;
  let primaryError = null;
  let hasPrimaryError = false;
  try {
    const target = await client.query(
      "SELECT current_database() AS database_name, current_user AS user_name, inet_server_port() AS server_port"
    );
    const observed = target.rows[0];
    if (
      target.rowCount !== 1 ||
      observed?.database_name !== databaseName ||
      observed?.user_name !== "shiftflow" ||
      Number(observed?.server_port) !== 5432
    ) {
      throw new Error("PostgreSQL reported a target outside the controlled disposable boundary.");
    }
    operationResult = await operation(client);
  } catch (error) {
    primaryError = error;
    hasPrimaryError = true;
  }

  try {
    await client.end();
  } catch (endError) {
    if (hasPrimaryError) {
      throw preservePrimaryFailure(primaryError, endError, "PostgreSQL client shutdown");
    }
    throw endError;
  }

  if (hasPrimaryError) {
    throw primaryError;
  }
  return operationResult;
}

async function createTemplate(runId, baseUrl) {
  const databaseName = templateDatabaseName(runId);
  await withClient(baseUrl, "shiftflow", async (client) => {
    await client.query(
      `CREATE DATABASE ${quoteGeneratedDatabase(databaseName)} WITH OWNER "shiftflow" TEMPLATE template0`
    );
  });
  return databaseName;
}

async function markCurrentMigrationUnfinished(client) {
  const result = await client.query(
    'UPDATE public."_prisma_migrations" SET finished_at = NULL, rolled_back_at = NULL WHERE migration_name = $1',
    [REQUIRED_MIGRATION]
  );
  if (result.rowCount !== 1) {
    throw new Error("The current migration ledger row was not uniquely mutable.");
  }
}

async function markCurrentMigrationRolledBack(client) {
  const result = await client.query(
    'UPDATE public."_prisma_migrations" SET rolled_back_at = CURRENT_TIMESTAMP WHERE migration_name = $1',
    [REQUIRED_MIGRATION]
  );
  if (result.rowCount !== 1) {
    throw new Error("The current migration ledger row was not uniquely mutable.");
  }
}

async function reverseCurrentMigration(client) {
  await client.query('DROP TABLE public."authentication_session_observations"');
  await client.query(
    'DROP INDEX public."refresh_tokens_userId_companyId_sessionKind_expiresAt_revokedAt_idx"'
  );
  await client.query(
    'DROP INDEX public."refresh_tokens_userId_companyId_sessionKind_familyId_revokedAt_idx"'
  );
  await client.query('ALTER TABLE public."refresh_tokens" DROP COLUMN "sessionKind"');
  await client.query('ALTER TABLE public."refresh_tokens" DROP COLUMN "familyId"');
  await client.query('DROP TYPE public."AuthenticationSessionKind"');
  const result = await client.query(
    'DELETE FROM public."_prisma_migrations" WHERE migration_name = $1',
    [REQUIRED_MIGRATION]
  );
  if (result.rowCount !== 1) {
    throw new Error("The current migration ledger row was not uniquely reversible.");
  }
}

async function createSplitSchema(client) {
  await client.query('CREATE SCHEMA "active" AUTHORIZATION "shiftflow"');
  await client.query(
    'CREATE TABLE "active"."_prisma_migrations" (LIKE public."_prisma_migrations" INCLUDING ALL)'
  );
  await client.query(
    'INSERT INTO "active"."_prisma_migrations" SELECT * FROM public."_prisma_migrations"'
  );
}

async function replaceCoreTableWithView(client) {
  await client.query('DROP TABLE public."audit_logs"');
  await client.query('CREATE VIEW public."audit_logs" AS SELECT NULL::uuid AS "id" WHERE FALSE');
}

async function moveRbacIndexToWrongTable(client) {
  await client.query('DROP INDEX public."user_role_assignments_active_exact_key"');
  await client.query(
    'CREATE UNIQUE INDEX "user_role_assignments_active_exact_key" ON public."roles"("id")'
  );
}

async function replaceRbacIndexDefinition(client) {
  await client.query('DROP INDEX public."user_role_assignments_active_exact_key"');
  await client.query(`
    CREATE UNIQUE INDEX "user_role_assignments_active_exact_key"
    ON public."user_role_assignments"(
      "userId", "companyId", "roleId", "clientId", "teamId", "startsAt", "endsAt"
    )
    WHERE "deletedAt" IS NOT NULL
  `);
}

async function malformAuthenticationColumns(client) {
  await client.query('ALTER TABLE public."refresh_tokens" ALTER COLUMN "familyId" DROP NOT NULL');
  await client.query(
    'ALTER TABLE public."authentication_session_observations" ALTER COLUMN "emailHash" TYPE text'
  );
}

async function malformAuthenticationConstraints(client) {
  await client.query(
    'ALTER TABLE public."authentication_session_observations" DROP CONSTRAINT "authentication_session_observations_pkey"'
  );
  await client.query(
    'ALTER TABLE public."authentication_session_observations" DROP CONSTRAINT "authentication_session_observations_userId_fkey"'
  );
  await client.query(`
    ALTER TABLE public."authentication_session_observations"
    ADD CONSTRAINT "authentication_session_observations_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES public."companies"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
  `);
  await client.query(
    'ALTER TABLE public."authentication_session_observations" DROP CONSTRAINT "authentication_session_observations_companyId_fkey"'
  );
  await client.query(`
    ALTER TABLE public."authentication_session_observations"
    ADD CONSTRAINT "authentication_session_observations_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES public."users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
  `);
}

async function malformAuthenticationIndex(client) {
  await client.query(
    'DROP INDEX public."authentication_session_observations_companyId_sessionKind_observedAt_idx"'
  );
  await client.query(`
    CREATE INDEX "authentication_session_observations_companyId_sessionKind_observedAt_idx"
    ON public."authentication_session_observations"("sessionKind", "companyId", "observedAt")
  `);
}

async function applyScenario(client, scenario) {
  switch (scenario) {
    case "fully-migrated":
      return;
    case "current-migration-absent":
      await reverseCurrentMigration(client);
      return;
    case "current-ledger-unfinished":
      await markCurrentMigrationUnfinished(client);
      return;
    case "current-ledger-rolled-back":
      await markCurrentMigrationRolledBack(client);
      return;
    case "split-decoy-schema":
      await createSplitSchema(client);
      return;
    case "core-table-view":
      await replaceCoreTableWithView(client);
      return;
    case "rbac-index-wrong-owner":
      await moveRbacIndexToWrongTable(client);
      return;
    case "rbac-index-wrong-definition":
      await replaceRbacIndexDefinition(client);
      return;
    case "auth-column-malformed":
      await malformAuthenticationColumns(client);
      return;
    case "auth-constraints-malformed":
      await malformAuthenticationConstraints(client);
      return;
    case "auth-index-malformed":
      await malformAuthenticationIndex(client);
      return;
    default:
      throw new Error("The readiness scenario has no mutation implementation.");
  }
}

async function createScenario(runId, scenario, baseUrl) {
  const templateName = templateDatabaseName(runId);
  const databaseName = scenarioDatabaseName(runId, scenario);
  await withClient(baseUrl, "shiftflow", async (client) => {
    await client.query(
      `CREATE DATABASE ${quoteGeneratedDatabase(databaseName)} WITH OWNER "shiftflow" TEMPLATE ${quoteGeneratedDatabase(templateName)}`
    );
  });

  const scenarioUrl = databaseUrlFor(baseUrl, databaseName);
  await withClient(scenarioUrl, databaseName, async (client) => {
    await client.query("BEGIN");
    try {
      await applyScenario(client, scenario);
      await client.query("COMMIT");
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        throw preservePrimaryFailure(error, rollbackError, "scenario rollback");
      }
      throw error;
    }
  });
  return databaseName;
}

function safeObservation(observation) {
  let rendered;
  try {
    rendered = JSON.stringify(observation);
  } catch {
    rendered = "unserialisable response";
  }
  return rendered.slice(0, RESPONSE_LIMIT);
}

async function getObservation(baseUrl, path) {
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(2_000)
    });
    const responseText = (await response.text()).slice(0, RESPONSE_LIMIT);
    let body = null;
    try {
      body = JSON.parse(responseText);
    } catch {
      // A non-JSON response remains an exact failed observation.
    }
    return Object.freeze({ status: response.status, body, responseText });
  } catch (error) {
    return Object.freeze({
      status: 0,
      body: null,
      responseText:
        error instanceof Error ? error.message.slice(0, RESPONSE_LIMIT) : "request failed"
    });
  }
}

function isExpectedHealth(observation, service) {
  return (
    observation.status === 200 &&
    observation.body?.status === "ok" &&
    observation.body?.service === service
  );
}

function isExpectedReadiness(observation, host, shouldBeReady) {
  if (host === "legacy-api") {
    return shouldBeReady
      ? observation.status === 200 &&
          observation.body?.status === "ready" &&
          observation.body?.service === "shiftflow-api"
      : observation.status === 503 && observation.body?.error?.code === "READINESS_CHECK_FAILED";
  }

  const checks = observation.body?.checks;
  return shouldBeReady
    ? observation.status === 200 &&
        observation.body?.status === "ready" &&
        observation.body?.service === "shiftflow-api-dotnet" &&
        checks?.postgresql === "available" &&
        checks?.redis === "available" &&
        checks?.dataProtection === "available"
    : observation.status === 503 &&
        observation.body?.status === "not_ready" &&
        observation.body?.service === "shiftflow-api-dotnet" &&
        checks?.postgresql === "unavailable" &&
        checks?.redis === "available" &&
        checks?.dataProtection === "available";
}

async function waitForObservation(baseUrl, path, predicate, description) {
  let lastObservation = null;
  for (let attempt = 1; attempt <= PROBE_ATTEMPTS; attempt += 1) {
    lastObservation = await getObservation(baseUrl, path);
    if (predicate(lastObservation)) {
      return lastObservation;
    }
    if (attempt < PROBE_ATTEMPTS) {
      await delay(PROBE_DELAY_MS);
    }
  }
  throw new Error(`${description} did not match: ${safeObservation(lastObservation)}`);
}

async function confirmNegativeReadiness(baseUrl, host, scenario) {
  let consecutiveMatches = 0;
  let lastObservation = null;
  for (let attempt = 1; attempt <= PROBE_ATTEMPTS; attempt += 1) {
    lastObservation = await getObservation(baseUrl, "/ready");
    if (lastObservation.status === 200) {
      throw new Error(
        `${host} readiness for ${scenario} returned HTTP 200 after liveness: ${safeObservation(lastObservation)}`
      );
    }
    if (isExpectedReadiness(lastObservation, host, false)) {
      consecutiveMatches += 1;
      if (consecutiveMatches >= NEGATIVE_CONFIRMATION_SAMPLES) {
        return lastObservation;
      }
    } else {
      consecutiveMatches = 0;
    }
    if (attempt < PROBE_ATTEMPTS) {
      await delay(PROBE_DELAY_MS);
    }
  }
  throw new Error(
    `${host} negative readiness for ${scenario} did not remain stable for ${NEGATIVE_CONFIRMATION_SAMPLES} consecutive samples: ${safeObservation(lastObservation)}`
  );
}

async function probeScenario(runId, scenario, host) {
  const contract = requireHost(host);
  const containerName = hostContainerName(runId, scenario, host);
  const baseUrl = `http://${containerName}:${contract.port}`;
  await waitForObservation(
    baseUrl,
    "/health",
    (observation) => isExpectedHealth(observation, contract.service),
    `${host} liveness`
  );
  const shouldBeReady = scenario === "fully-migrated";
  if (shouldBeReady) {
    await waitForObservation(
      baseUrl,
      "/ready",
      (observation) => isExpectedReadiness(observation, host, true),
      `${host} readiness for ${scenario}`
    );
  } else {
    await confirmNegativeReadiness(baseUrl, host, scenario);
  }
  return containerName;
}

function sanitiseError(error) {
  let message = error instanceof Error ? error.message : "unknown readiness runtime failure";
  const rawDatabaseUrl = process.env.DATABASE_URL;
  if (rawDatabaseUrl) {
    message = message.replaceAll(rawDatabaseUrl, "[REDACTED_DATABASE_URL]");
    try {
      const password = decodeURIComponent(new URL(rawDatabaseUrl).password);
      if (password) {
        message = message.replaceAll(password, "[REDACTED_PASSWORD]");
        message = message.replaceAll(encodeURIComponent(password), "[REDACTED_PASSWORD]");
      }
    } catch {
      // The URL validation failure itself is already bounded and contains no caller value.
    }
  }
  return message.slice(0, RESPONSE_LIMIT);
}

async function main() {
  requireDisposableAuthority();
  const args = parseArguments(process.argv.slice(2));
  const runId = requireRunId(args.runId);
  const baseUrl = controlledDatabaseUrl();

  if (args.action === "create-template") {
    const database = await createTemplate(runId, baseUrl);
    console.log(JSON.stringify({ status: "created", action: args.action, database }));
    return;
  }

  const scenario = args.scenario;
  requireScenario(scenario);
  if (args.action === "create-scenario") {
    const database = await createScenario(runId, scenario, baseUrl);
    console.log(JSON.stringify({ status: "created", action: args.action, scenario, database }));
    return;
  }

  const host = args.host;
  requireHost(host);
  const container = await probeScenario(runId, scenario, host);
  console.log(
    JSON.stringify({ status: "verified", action: args.action, scenario, host, container })
  );
}

try {
  await main();
} catch (error) {
  console.error(`Readiness runtime operation failed: ${sanitiseError(error)}`);
  process.exitCode = 1;
}
