// en-GB: Defines the audit writer implementation so this project responsibility remains explicit and maintainable.
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

const sensitiveKeys = new Set([
  "password",
  "passwordHash",
  "refreshToken",
  "token",
  "tokenHash",
  "accessToken",
  "authorization",
  "cookie"
]);

const sensitiveKeyPattern =
  /(api[-_]?key|authorization|cookie|credential|jwt|password|secret|token)/i;

function isSensitiveKey(key: string) {
  return sensitiveKeys.has(key) || sensitiveKeyPattern.test(key);
}

function redact(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redact);
  }
  if (!value || typeof value !== "object" || value instanceof Date) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      isSensitiveKey(key) ? "[REDACTED]" : redact(entry)
    ])
  );
}

export function buildAuditData(req: ApiRequest, input: AuditInput) {
  const { before, after, ...rest } = input;
  return {
    ...rest,
    ...(before !== undefined ? { before: redact(before) } : {}),
    ...(after !== undefined ? { after: redact(after) } : {}),
    actorUserId: req.auth?.id,
    requestId: req.context?.requestId,
    ipAddress: req.context?.ipAddress,
    userAgent: req.context?.userAgent
  };
}

export async function writeAudit(req: ApiRequest, input: AuditInput) {
  const auditLog = await getDelegate<AuditDelegate>("auditLog");
  await auditLog.create({ data: buildAuditData(req, input) });
}
