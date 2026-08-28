// en-GB: Creates deterministic cross-tenant Audit fixtures for the ASP.NET Core strangler smoke test.
/* global console, process */

import { PrismaPg } from "@prisma/adapter-pg";
import { URL } from "node:url";
import { PrismaClient } from "../generated/prisma/client.js";

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required to create the strangler integration fixture.`);
  }
  return value;
}

const connectionString = required("DATABASE_URL");
const integrationEmail = required("E2E_EMAIL");
const disposableAuthority = required("SHIFTFLOW_DISPOSABLE_RUNTIME");
if (disposableAuthority !== "CONFIRMED_DISPOSABLE_STRANGLER") {
  throw new Error("The strangler integration fixture requires disposable-runtime authority.");
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
  throw new Error("The strangler integration fixture accepts only the isolated Compose database.");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString })
});

const controlCompanyId = "77777777-7777-4777-8777-777777777777";
const visibleAuditId = "88888888-8888-4888-8888-888888888881";
const hiddenAuditId = "88888888-8888-4888-8888-888888888882";

async function main() {
  const integrationCompany = await prisma.company.findUnique({
    where: { name: "ShiftFlow Integration Company" },
    select: { id: true }
  });
  const integrationUser = await prisma.user.findUnique({
    where: { email: integrationEmail },
    select: { id: true }
  });

  if (!integrationCompany || !integrationUser) {
    throw new Error("Run prisma/integration-seed.mjs before creating the strangler fixture.");
  }

  await prisma.company.upsert({
    where: { id: controlCompanyId },
    create: {
      id: controlCompanyId,
      name: "ShiftFlow Strangler Control Company",
      legalName: "ShiftFlow Strangler Control Company Ltd.",
      timezone: "America/Sao_Paulo",
      status: "ACTIVE"
    },
    update: {
      legalName: "ShiftFlow Strangler Control Company Ltd.",
      status: "ACTIVE",
      deletedAt: null
    }
  });

  await prisma.auditLog.upsert({
    where: { id: visibleAuditId },
    create: {
      id: visibleAuditId,
      companyId: integrationCompany.id,
      actorUserId: integrationUser.id,
      entityType: "MigrationProbe",
      entityId: "tenant-visible",
      action: "STRANGLER_SMOKE",
      before: {
        safe: "retained",
        password: "test-sensitive-value-that-must-not-cross",
        nested: [{ refresh_token: "test-nested-sensitive-value-to-remove", value: 7 }]
      },
      after: { status: "migrated" },
      requestId: "strangler-smoke-visible"
    },
    update: {
      companyId: integrationCompany.id,
      actorUserId: integrationUser.id,
      entityType: "MigrationProbe",
      entityId: "tenant-visible",
      action: "STRANGLER_SMOKE",
      before: {
        safe: "retained",
        password: "test-sensitive-value-that-must-not-cross",
        nested: [{ refresh_token: "test-nested-sensitive-value-to-remove", value: 7 }]
      },
      after: { status: "migrated" },
      requestId: "strangler-smoke-visible"
    }
  });

  await prisma.auditLog.upsert({
    where: { id: hiddenAuditId },
    create: {
      id: hiddenAuditId,
      companyId: controlCompanyId,
      entityType: "MigrationProbe",
      entityId: "tenant-hidden",
      action: "STRANGLER_SMOKE",
      requestId: "strangler-smoke-hidden"
    },
    update: {
      companyId: controlCompanyId,
      actorUserId: null,
      entityType: "MigrationProbe",
      entityId: "tenant-hidden",
      action: "STRANGLER_SMOKE",
      before: null,
      after: null,
      requestId: "strangler-smoke-hidden"
    }
  });

  console.log(
    JSON.stringify({
      status: "ok",
      fixture: "aspnet-core-strangler",
      visibleAuditId,
      hiddenAuditId
    })
  );
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
