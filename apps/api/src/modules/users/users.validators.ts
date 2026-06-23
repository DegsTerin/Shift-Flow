import { z } from "zod";

export const createUserSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(8).max(160),
  displayName: z.string().min(2).max(160),
  jobTitle: z.string().max(120).optional(),
  status: z.enum(["INVITED", "ACTIVE", "INACTIVE", "LOCKED"]).optional(),
  preferredLocale: z.enum(["PT_BR", "EN_GB"]).optional(),
  preferredTheme: z.enum(["SYSTEM", "LIGHT", "DARK"]).optional(),
  roleId: z.string().uuid().optional()
});

export const updateUserSchema = createUserSchema
  .omit({ password: true })
  .partial()
  .extend({ password: z.string().min(8).max(160).optional() });
