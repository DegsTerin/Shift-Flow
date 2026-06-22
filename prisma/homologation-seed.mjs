/* global console, process */

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";

const connectionString = process.env.DATABASE_URL;
const volume = Number(process.env.HOMOLOGATION_ACTIVITY_COUNT ?? 120);

if (!connectionString) {
  throw new Error("DATABASE_URL is required to run the homologation seed.");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

const statuses = ["PENDING", "IN_PROGRESS", "WAITING_THIRD_PARTY", "MONITORING", "DONE"];
const priorities = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
const systems = ["Core Banking", "Payments", "API Gateway", "Identity", "Observability"];

async function main() {
  const [company, client, team, shift, admin, analyst] = await Promise.all([
    prisma.company.findFirstOrThrow({ where: { name: "ShiftFlow Integration Company" } }),
    prisma.client.findFirstOrThrow({ where: { name: "Integration Client", deletedAt: null } }),
    prisma.team.findFirstOrThrow({ where: { name: "Integration Operations", deletedAt: null } }),
    prisma.shift.findFirstOrThrow({ where: { name: "Integration Day Shift", deletedAt: null } }),
    prisma.user.findFirstOrThrow({ where: { email: "integration.admin@shiftflow.local" } }),
    prisma.user.findFirstOrThrow({ where: { email: "integration.analyst@shiftflow.local" } }),
  ]);

  const now = new Date();
  const existing = await prisma.activity.findMany({
    where: {
      companyId: company.id,
      title: { startsWith: "Homologation volume activity " },
    },
    select: { title: true },
  });
  const existingTitles = new Set(existing.map((activity) => activity.title));
  const activities = [];

  for (let index = 1; index <= volume; index += 1) {
    const title = `Homologation volume activity ${String(index).padStart(3, "0")}`;
    if (existingTitles.has(title)) {
      continue;
    }

    const status = statuses[index % statuses.length];
    const priority = priorities[index % priorities.length];
    const createdAt = new Date(now.getTime() - index * 10 * 60 * 1000);
    const slaDueAt = new Date(now.getTime() + ((index % 12) + 1) * 30 * 60 * 1000);

    activities.push({
      companyId: company.id,
      clientId: client.id,
      teamId: team.id,
      shiftId: shift.id,
      assigneeId: analyst.id,
      reporterId: admin.id,
      title,
      description: "STATE-07 homologation volume fixture activity.",
      systemName: systems[index % systems.length],
      status,
      priority,
      slaDueAt,
      startedAt: ["IN_PROGRESS", "MONITORING", "DONE"].includes(status) ? createdAt : null,
      completedAt: status === "DONE" ? new Date(createdAt.getTime() + 60 * 60 * 1000) : null,
      createdAt,
      updatedAt: createdAt,
      createdById: admin.id,
      updatedById: admin.id,
    });
  }

  if (activities.length > 0) {
    await prisma.activity.createMany({ data: activities });
  }

  const totalHomologationActivities = await prisma.activity.count({
    where: {
      companyId: company.id,
      title: { startsWith: "Homologation volume activity " },
      deletedAt: null,
    },
  });
  const totalActivities = await prisma.activity.count({
    where: { companyId: company.id, deletedAt: null },
  });

  console.log(
    JSON.stringify(
      {
        status: "ok",
        createdActivities: activities.length,
        totalHomologationActivities,
        totalActivities,
      },
      null,
      2,
    ),
  );
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
