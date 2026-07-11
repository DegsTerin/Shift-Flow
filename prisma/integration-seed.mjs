// en-GB: Creates controlled integration seed data so local validation uses a repeatable database state.
/* global console, process */

import "dotenv/config";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is required to run the integration seed.");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString })
});

function requiredSeedEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required at seed runtime and must not be committed to .env files.`);
  }
  return value;
}

function bcryptRounds() {
  const rounds = Number(process.env.SEED_BCRYPT_ROUNDS ?? 12);
  return Number.isFinite(rounds) && rounds >= 10 ? rounds : 12;
}

const integrationUser = {
  email: requiredSeedEnv("E2E_EMAIL"),
  password: requiredSeedEnv("E2E_PASSWORD")
};

function hashIdentifier(value) {
  return crypto
    .createHash("sha256")
    .update(value?.trim().toLowerCase() ?? "unknown")
    .digest("hex");
}

async function findOrCreate(delegate, where, create, update = {}) {
  const existing = await delegate.findFirst({ where });

  if (existing) {
    return delegate.update({
      where: { id: existing.id },
      data: update
    });
  }

  return delegate.create({ data: create });
}

async function ensureLink(delegate, where, create) {
  const existing = await delegate.findFirst({ where });
  return existing ?? delegate.create({ data: create });
}

async function main() {
  const now = new Date();
  const startsAt = new Date(now);
  startsAt.setHours(8, 0, 0, 0);
  const endsAt = new Date(now);
  endsAt.setHours(18, 0, 0, 0);
  const slaSoon = new Date(now.getTime() + 30 * 60 * 1000);
  const slaLater = new Date(now.getTime() + 4 * 60 * 60 * 1000);

  const company = await findOrCreate(
    prisma.company,
    { name: "ShiftFlow Integration Company" },
    {
      name: "ShiftFlow Integration Company",
      legalName: "ShiftFlow Integration Company Ltd.",
      document: "STATE06-INTEGRATION",
      timezone: "America/Sao_Paulo",
      status: "ACTIVE"
    },
    {
      legalName: "ShiftFlow Integration Company Ltd.",
      timezone: "America/Sao_Paulo",
      status: "ACTIVE",
      deletedAt: null
    }
  );

  const passwordHash = await bcrypt.hash(integrationUser.password, bcryptRounds());

  async function syncSeedPassword(user) {
    const passwordMatches = await bcrypt.compare(integrationUser.password, user.passwordHash);
    if (passwordMatches) return user;

    return prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        passwordChangedAt: now
      }
    });
  }

  let admin = await findOrCreate(
    prisma.user,
    { email: integrationUser.email },
    {
      email: integrationUser.email,
      passwordHash,
      displayName: "Integration Admin",
      jobTitle: "Operations Lead",
      status: "ACTIVE",
      preferredLocale: "PT_BR",
      preferredTheme: "SYSTEM",
      passwordChangedAt: now
    },
    {
      displayName: "Integration Admin",
      jobTitle: "Operations Lead",
      status: "ACTIVE",
      preferredLocale: "PT_BR",
      preferredTheme: "SYSTEM",
      deletedAt: null
    }
  );
  admin = await syncSeedPassword(admin);
  await prisma.authLoginAttempt.deleteMany({
    where: { emailHash: hashIdentifier(integrationUser.email) }
  });

  let analyst = await findOrCreate(
    prisma.user,
    { email: "integration.analyst@shiftflow.local" },
    {
      email: "integration.analyst@shiftflow.local",
      passwordHash,
      displayName: "Integration Analyst",
      jobTitle: "Support Analyst",
      status: "ACTIVE",
      preferredLocale: "PT_BR",
      preferredTheme: "LIGHT",
      passwordChangedAt: now
    },
    {
      displayName: "Integration Analyst",
      jobTitle: "Support Analyst",
      status: "ACTIVE",
      deletedAt: null
    }
  );
  analyst = await syncSeedPassword(analyst);

  await ensureLink(
    prisma.userCompany,
    { companyId: company.id, userId: admin.id },
    { companyId: company.id, userId: admin.id, isDefault: true }
  );
  await ensureLink(
    prisma.userCompany,
    { companyId: company.id, userId: analyst.id },
    { companyId: company.id, userId: analyst.id, isDefault: false }
  );

  const client = await findOrCreate(
    prisma.client,
    { companyId: company.id, name: "Integration Client" },
    {
      companyId: company.id,
      name: "Integration Client",
      code: "INT-CLIENT",
      status: "ACTIVE",
      createdById: admin.id,
      updatedById: admin.id
    },
    {
      code: "INT-CLIENT",
      status: "ACTIVE",
      deletedAt: null,
      updatedById: admin.id
    }
  );

  const team = await findOrCreate(
    prisma.team,
    { companyId: company.id, name: "Integration Operations" },
    {
      companyId: company.id,
      name: "Integration Operations",
      description: "Team used for STATE-06 integration validation.",
      color: "#2563eb",
      defaultSlaMinutes: 240,
      createdById: admin.id,
      updatedById: admin.id
    },
    {
      description: "Team used for STATE-06 integration validation.",
      color: "#2563eb",
      defaultSlaMinutes: 240,
      deletedAt: null,
      updatedById: admin.id
    }
  );

  await ensureLink(
    prisma.teamClient,
    { companyId: company.id, teamId: team.id, clientId: client.id },
    { companyId: company.id, teamId: team.id, clientId: client.id }
  );
  await ensureLink(
    prisma.userClient,
    { companyId: company.id, clientId: client.id, userId: admin.id },
    { companyId: company.id, clientId: client.id, userId: admin.id }
  );
  await ensureLink(
    prisma.userClient,
    { companyId: company.id, clientId: client.id, userId: analyst.id },
    { companyId: company.id, clientId: client.id, userId: analyst.id }
  );
  await ensureLink(
    prisma.teamMember,
    { companyId: company.id, teamId: team.id, userId: admin.id, deletedAt: null },
    { companyId: company.id, teamId: team.id, userId: admin.id, role: "LEADER" }
  );
  await ensureLink(
    prisma.teamMember,
    { companyId: company.id, teamId: team.id, userId: analyst.id, deletedAt: null },
    { companyId: company.id, teamId: team.id, userId: analyst.id, role: "MEMBER" }
  );

  const shift = await findOrCreate(
    prisma.shift,
    { companyId: company.id, name: "Integration Day Shift" },
    {
      companyId: company.id,
      name: "Integration Day Shift",
      startsAt,
      endsAt,
      timezone: "America/Sao_Paulo",
      status: "OPEN",
      createdById: admin.id,
      updatedById: admin.id
    },
    {
      startsAt,
      endsAt,
      timezone: "America/Sao_Paulo",
      status: "OPEN",
      deletedAt: null,
      updatedById: admin.id
    }
  );

  await ensureLink(
    prisma.shiftCoverage,
    { companyId: company.id, shiftId: shift.id, userId: admin.id, deletedAt: null },
    {
      companyId: company.id,
      shiftId: shift.id,
      userId: admin.id,
      type: "REGULAR",
      startsAt,
      endsAt,
      note: "Integration validation coverage."
    }
  );

  const permissions = [
    ["*", "*"],
    ["dashboard", "read"],
    ["clients", "read"],
    ["clients", "write"],
    ["clients", "delete"],
    ["users", "read"],
    ["users", "write"],
    ["teams", "read"],
    ["teams", "write"],
    ["shifts", "read"],
    ["shifts", "write"],
    ["activities", "read"],
    ["activities", "write"],
    ["comments", "read"],
    ["comments", "write"],
    ["comments", "delete"],
    ["comments", "moderate"],
    ["notifications", "read"],
    ["notifications", "write"],
    ["rbac", "read"],
    ["rbac", "write"],
    ["reports", "read"]
  ];

  const role = await findOrCreate(
    prisma.role,
    { companyId: company.id, name: "Integration Admin" },
    {
      companyId: company.id,
      name: "Integration Admin",
      description: "Role used for STATE-06 integration validation.",
      scope: "COMPANY",
      isSystem: true
    },
    {
      description: "Role used for STATE-06 integration validation.",
      scope: "COMPANY",
      isSystem: true,
      deletedAt: null
    }
  );

  for (const [resource, action] of permissions) {
    const permission = await findOrCreate(
      prisma.permission,
      { companyId: company.id, resource, action },
      {
        companyId: company.id,
        resource,
        action,
        description: `Integration permission ${resource}:${action}`,
        isSystem: true
      },
      {
        description: `Integration permission ${resource}:${action}`,
        isSystem: true,
        deletedAt: null
      }
    );

    await ensureLink(
      prisma.rolePermission,
      { roleId: role.id, permissionId: permission.id },
      { companyId: company.id, roleId: role.id, permissionId: permission.id }
    );
  }

  await ensureLink(
    prisma.userRoleAssignment,
    { companyId: company.id, userId: admin.id, roleId: role.id, deletedAt: null },
    { companyId: company.id, userId: admin.id, roleId: role.id }
  );

  const activitySpecs = [
    {
      title: "Validate priority incident queue",
      status: "PENDING",
      priority: "CRITICAL",
      systemName: "Core Banking",
      slaDueAt: slaSoon
    },
    {
      title: "Monitor batch settlement delay",
      status: "IN_PROGRESS",
      priority: "HIGH",
      systemName: "Payments",
      slaDueAt: slaLater,
      startedAt: now
    },
    {
      title: "Review third-party callback",
      status: "WAITING_CUSTOMER",
      priority: "MEDIUM",
      systemName: "API Gateway",
      serviceName: "Client callback",
      slaDueAt: slaLater
    },
    {
      title: "Close resolved access request",
      status: "DONE",
      priority: "LOW",
      systemName: "Identity",
      serviceName: "Access management",
      slaDueAt: slaLater,
      completedAt: now
    }
  ];

  const activities = [];

  for (const spec of activitySpecs) {
    const activity = await findOrCreate(
      prisma.activity,
      { companyId: company.id, title: spec.title },
      {
        companyId: company.id,
        clientId: client.id,
        teamId: team.id,
        shiftId: shift.id,
        assigneeId: analyst.id,
        reporterId: admin.id,
        title: spec.title,
        description: "STATE-06 integration fixture activity.",
        requested: `Request handling for ${spec.title}.`,
        performed: "Initial triage completed and operational context validated.",
        inProgressDetail:
          spec.status === "IN_PROGRESS"
            ? "Execution is currently underway."
            : "No active execution at this stage.",
        pendingDetail:
          spec.status === "DONE" ? "No pending action." : "Awaiting next operational update.",
        finalizationDetail:
          spec.status === "DONE"
            ? "Resolved and closed during the current shift."
            : "Not finalised yet.",
        observations: "Integration fixture with complete operational report fields.",
        systemName: spec.systemName,
        serviceName: spec.serviceName ?? "Operational support",
        status: spec.status,
        priority: spec.priority,
        slaDueAt: spec.slaDueAt,
        startedAt: spec.startedAt,
        completedAt: spec.completedAt,
        createdById: admin.id,
        updatedById: admin.id
      },
      {
        clientId: client.id,
        teamId: team.id,
        shiftId: shift.id,
        assigneeId: analyst.id,
        reporterId: admin.id,
        description: "STATE-06 integration fixture activity.",
        requested: `Request handling for ${spec.title}.`,
        performed: "Initial triage completed and operational context validated.",
        inProgressDetail:
          spec.status === "IN_PROGRESS"
            ? "Execution is currently underway."
            : "No active execution at this stage.",
        pendingDetail:
          spec.status === "DONE" ? "No pending action." : "Awaiting next operational update.",
        finalizationDetail:
          spec.status === "DONE"
            ? "Resolved and closed during the current shift."
            : "Not finalised yet.",
        observations: "Integration fixture with complete operational report fields.",
        systemName: spec.systemName,
        serviceName: spec.serviceName ?? "Operational support",
        status: spec.status,
        priority: spec.priority,
        slaDueAt: spec.slaDueAt,
        startedAt: spec.startedAt ?? null,
        completedAt: spec.completedAt ?? null,
        deletedAt: null,
        updatedById: admin.id
      }
    );
    activities.push(activity);

    await ensureLink(
      prisma.activityHistory,
      { companyId: company.id, activityId: activity.id, type: "CREATED" },
      {
        companyId: company.id,
        activityId: activity.id,
        actorUserId: admin.id,
        type: "CREATED",
        note: "Integration fixture bootstrap."
      }
    );
  }

  await ensureLink(
    prisma.notification,
    {
      companyId: company.id,
      recipientId: admin.id,
      title: "Integration fixture ready",
      deletedAt: null
    },
    {
      companyId: company.id,
      recipientId: admin.id,
      clientId: client.id,
      teamId: team.id,
      shiftId: shift.id,
      activityId: activities[0]?.id,
      type: "SYSTEM",
      priority: "NORMAL",
      channel: "IN_APP",
      title: "Integration fixture ready",
      body: "STATE-06 integration data is available for validation."
    }
  );

  console.log(
    JSON.stringify(
      {
        status: "ok",
        login: { email: integrationUser.email },
        companyId: company.id,
        clientId: client.id,
        teamId: team.id,
        shiftId: shift.id,
        userIds: [admin.id, analyst.id],
        activityIds: activities.map((activity) => activity.id)
      },
      null,
      2
    )
  );
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
