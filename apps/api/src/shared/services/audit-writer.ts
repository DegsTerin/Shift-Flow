import { getDelegate } from "../lib/prisma.js";
import type { ApiRequest } from "../http/request-types.js";

type AuditDelegate = {
  create(args: unknown): Promise<unknown>;
};

type AuditInput = {
  entityType: string;
  entityId: string;
  action: string;
  before?: unknown;
  after?: unknown;
  companyId?: string;
  clientId?: string;
  teamId?: string;
  shiftId?: string;
  activityId?: string;
  shiftReportId?: string;
};

export async function writeAudit(req: ApiRequest, input: AuditInput) {
  const auditLog = await getDelegate<AuditDelegate>("auditLog");
  await auditLog.create({
    data: {
      ...input,
      actorUserId: req.auth?.id,
      requestId: req.context?.requestId,
      ipAddress: req.context?.ipAddress,
      userAgent: req.context?.userAgent,
    },
  });
}
