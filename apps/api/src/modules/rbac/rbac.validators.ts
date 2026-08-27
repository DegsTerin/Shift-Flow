// en-GB: Validates rbac input so malformed data cannot cross the module boundary.
import { z } from "zod";

export const permissionCreateSchema = z
  .object({
    resource: z.string().min(2).max(80),
    action: z.string().min(2).max(80),
    description: z.string().max(1000).optional()
  })
  .strict();

export const roleCreateSchema = z
  .object({
    name: z.string().min(2).max(120),
    description: z.string().max(2000).optional(),
    color: z.string().max(16).optional(),
    scope: z.enum(["COMPANY", "CLIENT", "TEAM"]).default("COMPANY"),
    isActive: z.boolean().optional()
  })
  .strict();

export const roleUpdateSchema = z
  .object({
    name: z.string().min(2).max(120).optional(),
    description: z.string().max(2000).optional(),
    color: z.string().max(16).optional(),
    scope: z.enum(["COMPANY", "CLIENT", "TEAM"]).optional(),
    isActive: z.boolean().optional()
  })
  .strict();

export const assignPermissionSchema = z.object({
  permissionId: z.string().uuid()
});

export const assignRoleSchema = z
  .object({
    userId: z.string().uuid(),
    roleId: z.string().uuid(),
    clientId: z.string().uuid().optional(),
    teamId: z.string().uuid().optional(),
    startsAt: z.coerce.date().optional(),
    endsAt: z.coerce.date().optional()
  })
  .strict()
  .superRefine((value, context) => {
    if (value.startsAt && value.endsAt && value.endsAt <= value.startsAt) {
      context.addIssue({
        code: "custom",
        path: ["endsAt"],
        message: "endsAt must be later than startsAt"
      });
    }
  });

export const permissionCheckSchema = z.object({
  resource: z.string().min(2).max(80),
  action: z.string().min(2).max(80)
});
