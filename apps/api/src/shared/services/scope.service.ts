import type { ApiRequest } from "../http/request-types.js";
import { badRequest, forbidden, notFound } from "../errors/app-error.js";
import { getDelegate } from "../lib/prisma.js";

type FindFirstDelegate<T = unknown> = {
  findFirst(args: unknown): Promise<T | null>;
};

export function activeCompanyId(req: ApiRequest) {
  const companyId = req.tenant?.companyId ?? req.auth?.companyId;
  if (!companyId) {
    throw badRequest("Company context is required");
  }
  return companyId;
}

export async function assertUserInCompany(userId: string | null | undefined, companyId: string) {
  if (!userId) return;
  const userCompany = await getDelegate<FindFirstDelegate>("userCompany");
  const linked = await userCompany.findFirst({
    where: { userId, companyId, deletedAt: null },
  });
  if (!linked) {
    throw forbidden("User does not belong to the active company");
  }
}

export async function assertClientInCompany(clientId: string | null | undefined, companyId: string) {
  if (!clientId) return;
  const client = await getDelegate<FindFirstDelegate>("client");
  const found = await client.findFirst({
    where: { id: clientId, companyId, deletedAt: null },
  });
  if (!found) {
    throw notFound("Client not found in active company");
  }
}

export async function assertTeamInCompany(teamId: string | null | undefined, companyId: string) {
  if (!teamId) return;
  const team = await getDelegate<FindFirstDelegate>("team");
  const found = await team.findFirst({
    where: { id: teamId, companyId, deletedAt: null },
  });
  if (!found) {
    throw notFound("Team not found in active company");
  }
}

export async function assertShiftInCompany(shiftId: string | null | undefined, companyId: string) {
  if (!shiftId) return;
  const shift = await getDelegate<FindFirstDelegate>("shift");
  const found = await shift.findFirst({
    where: { id: shiftId, companyId, deletedAt: null },
  });
  if (!found) {
    throw notFound("Shift not found in active company");
  }
}

export async function assertActivityInCompany(activityId: string | null | undefined, companyId: string) {
  if (!activityId) return;
  const activity = await getDelegate<FindFirstDelegate>("activity");
  const found = await activity.findFirst({
    where: { id: activityId, companyId, deletedAt: null },
  });
  if (!found) {
    throw notFound("Activity not found in active company");
  }
}
