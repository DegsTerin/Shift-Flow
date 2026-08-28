// en-GB: Guards destructive seeds and PostgreSQL integration so they target only approved disposable local databases.
import { URL } from "node:url";

export const destructiveSeedConfirmation = "DELETE_CONFIRMED_LOCAL_SHIFTFLOW_DATA";

const loopbackHosts = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
const allowedDatabasePattern = /^shiftflow(?:[_-][a-z0-9_-]+)?$/i;
const localRuntimeDatabasePattern = /^shiftflow_runtime_[a-f0-9]{24}$/;

function parsePostgresTarget(databaseUrl, purpose) {
  if (!databaseUrl) {
    throw new Error(`DATABASE_URL is required to run the ${purpose}.`);
  }

  let target;
  try {
    target = new URL(databaseUrl);
  } catch {
    throw new Error("DATABASE_URL must be a valid PostgreSQL URL.");
  }

  if (!["postgres:", "postgresql:"].includes(target.protocol)) {
    throw new Error(`${purpose} supports PostgreSQL URLs only.`);
  }
  if (!loopbackHosts.has(target.hostname.toLowerCase())) {
    throw new Error(`${purpose} is restricted to a loopback database host.`);
  }
  const unsupportedParameters = [...target.searchParams.keys()].filter((key) => key !== "schema");
  if (unsupportedParameters.length > 0) {
    throw new Error(
      `${purpose} rejects database routing parameters: ${unsupportedParameters.join(", ")}.`
    );
  }

  return {
    target,
    databaseName: decodeURIComponent(target.pathname.replace(/^\//u, ""))
  };
}

export function assertSafePostgresIntegrationTarget(databaseUrl, nodeEnv, ci) {
  const purpose = "disposable PostgreSQL integration test";
  if (nodeEnv?.trim().toLowerCase() === "production") {
    throw new Error(`${purpose} is forbidden in production.`);
  }
  const { target, databaseName } = parsePostgresTarget(databaseUrl, purpose);
  const port = target.port || "5432";
  const isLocalRuntime =
    target.hostname === "127.0.0.1" &&
    port === "55432" &&
    localRuntimeDatabasePattern.test(databaseName);
  const isContinuousIntegration =
    ci?.trim().toLowerCase() === "true" &&
    target.hostname === "localhost" &&
    port === "5432" &&
    databaseName === "shiftflow_ci";

  if (!isLocalRuntime && !isContinuousIntegration) {
    throw new Error(
      `${purpose} requires its exact local runtime target or the explicit CI target.`
    );
  }
  if (decodeURIComponent(target.password).length < 12) {
    throw new Error(`${purpose} requires an ephemeral password with at least 12 characters.`);
  }

  return { host: target.hostname, port, databaseName };
}

export function assertSafeDestructiveSeed({ databaseUrl, nodeEnv, confirmation, password }) {
  if (nodeEnv?.trim().toLowerCase() === "production") {
    throw new Error("The destructive realistic seed is forbidden in production.");
  }
  const { target, databaseName } = parsePostgresTarget(databaseUrl, "destructive realistic seed");
  if (!allowedDatabasePattern.test(databaseName)) {
    throw new Error(
      "The destructive realistic seed requires a database named shiftflow or shiftflow_<purpose>."
    );
  }
  if (confirmation !== destructiveSeedConfirmation) {
    throw new Error(
      `Set SHIFTFLOW_DESTRUCTIVE_SEED_CONFIRMATION=${destructiveSeedConfirmation} for this explicit local destructive operation.`
    );
  }
  if (!password || password.length < 12) {
    throw new Error(
      "REALISTIC_SEED_PASSWORD or E2E_PASSWORD with at least 12 characters is required."
    );
  }

  return { host: target.hostname, databaseName };
}
