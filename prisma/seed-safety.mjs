// en-GB: Guards destructive seed operations so they can target only explicitly confirmed disposable local ShiftFlow databases.
import { URL } from "node:url";

export const destructiveSeedConfirmation = "DELETE_CONFIRMED_LOCAL_SHIFTFLOW_DATA";

const loopbackHosts = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
const allowedDatabasePattern = /^shiftflow(?:[_-][a-z0-9_-]+)?$/i;

export function assertSafeDestructiveSeed({ databaseUrl, nodeEnv, confirmation, password }) {
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required to run the destructive realistic seed.");
  }
  if (nodeEnv?.trim().toLowerCase() === "production") {
    throw new Error("The destructive realistic seed is forbidden in production.");
  }

  let target;
  try {
    target = new URL(databaseUrl);
  } catch {
    throw new Error("DATABASE_URL must be a valid PostgreSQL URL.");
  }

  const databaseName = decodeURIComponent(target.pathname.replace(/^\//u, ""));
  if (!["postgres:", "postgresql:"].includes(target.protocol)) {
    throw new Error("The destructive realistic seed supports PostgreSQL URLs only.");
  }
  if (!loopbackHosts.has(target.hostname.toLowerCase())) {
    throw new Error("The destructive realistic seed is restricted to a loopback database host.");
  }
  const unsupportedParameters = [...target.searchParams.keys()].filter((key) => key !== "schema");
  if (unsupportedParameters.length > 0) {
    throw new Error(
      `The destructive realistic seed rejects database routing parameters: ${unsupportedParameters.join(", ")}.`
    );
  }
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
