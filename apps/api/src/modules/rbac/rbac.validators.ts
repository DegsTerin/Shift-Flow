import { z } from "zod";

export const permissionSchema = z.object({
  resource: z.string().min(2).max(80),
  action: z.string().min(2).max(80),
  description: z.string().max(1000).optional(),
  companyId: z.string().uuid().optional(),
  isSystem: z.boolean().optional()
});

export const roleSchema = z.object({
  name: z.string().min(2).max(120),
  description: z.string().max(2000).optional(),
  scope: z.enum(["GLOBAL", "COMPANY", "CLIENT", "TEAM"]).default("COMPANY"),
  companyId: z.string().uuid().optional(),
  isSystem: z.boolean().optional()
});

export const assignPermissionSchema = z.object({
  permissionId: z.string().uuid()
});

export const assignRoleSchema = z.object({
  userId: z.string().uuid(),
  roleId: z.string().uuid(),
  companyId: z.string().uuid(),
  clientId: z.string().uuid().optional(),
  teamId: z.string().uuid().optional(),
  startsAt: z.coerce.date().optional(),
  endsAt: z.coerce.date().optional()
});
