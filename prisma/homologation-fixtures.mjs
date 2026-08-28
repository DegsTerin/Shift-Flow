// en-GB: Defines deterministic homologation fixture timing so every dashboard risk partition is represented.
export const homologationStatuses = [
  "PENDING",
  "IN_PROGRESS",
  "WAITING_CUSTOMER",
  "WAITING_THIRD_PARTY",
  "MONITORING",
  "DONE"
];
const priorities = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
const systems = ["Core Banking", "Payments", "API Gateway", "Identity", "Observability"];
const services = [
  "Incident response",
  "Client contact",
  "Settlement",
  "Access request",
  "Availability analysis"
];
const maximumHomologationActivityCount = 1000;

export function parseHomologationActivityCount(value) {
  const parsed = Number(value ?? 120);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximumHomologationActivityCount) {
    throw new Error(
      `HOMOLOGATION_ACTIVITY_COUNT must be an integer between 1 and ${maximumHomologationActivityCount}.`
    );
  }
  return parsed;
}

export function homologationReferenceFilters(companyId, adminEmail) {
  const activeMembership = { some: { companyId, deletedAt: null } };
  return {
    client: { companyId, name: "Integration Client", deletedAt: null },
    team: { companyId, name: "Integration Operations", deletedAt: null },
    shift: { companyId, name: "Integration Day Shift", deletedAt: null },
    admin: {
      email: adminEmail,
      status: "ACTIVE",
      deletedAt: null,
      companies: activeMembership
    },
    analyst: {
      email: "integration.analyst@shiftflow.local",
      status: "ACTIVE",
      deletedAt: null,
      companies: activeMembership
    }
  };
}

export function homologationSlaDueAt(now, index) {
  const offsetMinutes = index % 10 === 0 ? -30 : ((index % 12) + 1) * 30;
  return new Date(now.getTime() + offsetMinutes * 60 * 1000);
}

export function buildHomologationFixturePlan(existingActivities, now, volume) {
  const existingIds = new Map(existingActivities.map((activity) => [activity.title, activity.id]));
  return Array.from({ length: volume }, (_, offset) => {
    const index = offset + 1;
    const title = `Homologation volume activity ${String(index).padStart(3, "0")}`;
    const status = homologationStatuses[index % homologationStatuses.length];
    const createdAt = new Date(now.getTime() - index * 10 * 60 * 1000);
    return {
      existingId: existingIds.get(title),
      index,
      title,
      status,
      priority: priorities[index % priorities.length],
      systemName: systems[index % systems.length],
      serviceName: services[index % services.length],
      slaDueAt: homologationSlaDueAt(now, index),
      startedAt: ["IN_PROGRESS", "MONITORING", "DONE"].includes(status) ? createdAt : null,
      completedAt: status === "DONE" ? new Date(createdAt.getTime() + 60 * 60 * 1000) : null,
      createdAt
    };
  });
}
