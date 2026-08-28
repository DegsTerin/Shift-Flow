// en-GB: Applies reversible disposable security controls so the strangler smoke proves live PostgreSQL authority.
/* global console, process */

import { PrismaPg } from "@prisma/adapter-pg";
import { URL } from "node:url";
import { PrismaClient } from "../generated/prisma/client.js";

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required for the strangler security control.`);
  }
  return value;
}

const connectionString = required("DATABASE_URL");
const integrationEmail = required("E2E_EMAIL");
const action = required("SMOKE_ACTION");
const disposableAuthority = required("SHIFTFLOW_DISPOSABLE_RUNTIME");
if (disposableAuthority !== "CONFIRMED_DISPOSABLE_STRANGLER") {
  throw new Error("The strangler security control requires disposable-runtime authority.");
}
const databaseUrl = new URL(connectionString);
if (
  databaseUrl.protocol !== "postgresql:" ||
  databaseUrl.hostname !== "postgres" ||
  databaseUrl.port !== "5432" ||
  databaseUrl.pathname !== "/shiftflow" ||
  databaseUrl.username !== "shiftflow" ||
  databaseUrl.search !== "?schema=public" ||
  databaseUrl.hash !== ""
) {
  throw new Error("The strangler security control accepts only the isolated Compose database.");
}
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

async function integrationIdentity() {
  const user = await prisma.user.findUnique({
    where: { email: integrationEmail },
    select: { id: true, passwordChangedAt: true }
  });
  const company = await prisma.company.findUnique({
    where: { name: "ShiftFlow Integration Company" },
    select: { id: true }
  });

  if (!user || !company) {
    throw new Error("The shared integration identity is missing.");
  }

  return { user, company };
}

async function setRoleActive(isActive) {
  const { company } = await integrationIdentity();
  const role = await prisma.role.findUnique({
    where: {
      companyId_name: {
        companyId: company.id,
        name: "Integration Admin"
      }
    },
    select: { id: true }
  });
  if (!role) {
    throw new Error("The integration role is missing.");
  }

  await prisma.role.update({
    where: { id: role.id },
    data: { isActive, deletedAt: null }
  });
}

async function revokeToken() {
  const jwtId = required("SMOKE_JWT_ID");
  if (jwtId.length > 120) {
    throw new Error("SMOKE_JWT_ID exceeds the persisted contract.");
  }
  const { user } = await integrationIdentity();

  await prisma.accessTokenRevocation.upsert({
    where: { jwtId },
    create: {
      jwtId,
      userId: user.id,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      requestId: "strangler-smoke-revocation"
    },
    update: {
      userId: user.id,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      requestId: "strangler-smoke-revocation"
    }
  });
}

async function advanceCredentialVersion() {
  const { user } = await integrationIdentity();
  const previousCredentialVersionMilliseconds = user.passwordChangedAt?.getTime() ?? 0;
  const previousCredentialVersion = user.passwordChangedAt
    ? `MILLISECONDS:${previousCredentialVersionMilliseconds}`
    : "NULL";
  const currentVersion = user.passwordChangedAt?.getTime() ?? 0;
  const advancedVersion = new Date(Math.max(Date.now() + 1000, currentVersion + 1000));

  const advanced = await prisma.user.update({
    where: { id: user.id },
    data: { passwordChangedAt: advancedVersion },
    select: { passwordChangedAt: true }
  });

  return {
    previousCredentialVersion,
    previousCredentialVersionMilliseconds,
    advancedCredentialVersionMilliseconds: advanced.passwordChangedAt?.getTime() ?? 0
  };
}

async function restoreCredentialVersion() {
  const encodedVersion = required("SMOKE_CREDENTIAL_VERSION");
  const millisecondsMatch = /^MILLISECONDS:(0|[1-9]\d*)$/.exec(encodedVersion);
  const milliseconds = millisecondsMatch ? Number(millisecondsMatch[1]) : Number.NaN;
  if (
    encodedVersion !== "NULL" &&
    (!Number.isSafeInteger(milliseconds) || milliseconds > 8_640_000_000_000_000)
  ) {
    throw new Error("SMOKE_CREDENTIAL_VERSION is not a valid millisecond literal or NULL.");
  }
  const passwordChangedAt = encodedVersion === "NULL" ? null : new Date(milliseconds);
  const { user } = await integrationIdentity();

  const restored = await prisma.user.update({
    where: { id: user.id },
    data: { passwordChangedAt },
    select: { passwordChangedAt: true }
  });

  return {
    restoredCredentialVersionMilliseconds: restored.passwordChangedAt?.getTime() ?? 0
  };
}

async function main() {
  let evidence = {};
  switch (action) {
    case "disable-role":
      await setRoleActive(false);
      break;
    case "enable-role":
      await setRoleActive(true);
      break;
    case "advance-credential-version":
      evidence = await advanceCredentialVersion();
      break;
    case "restore-credential-version":
      evidence = await restoreCredentialVersion();
      break;
    case "revoke-token":
      await revokeToken();
      break;
    default:
      throw new Error("SMOKE_ACTION is unsupported.");
  }

  console.log(JSON.stringify({ status: "ok", action, ...evidence }));
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
