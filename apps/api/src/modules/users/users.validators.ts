// en-GB: Validates users input so malformed data cannot cross the module boundary.
import { z } from "zod";
import { isPasswordWithinBcryptLimit } from "../../shared/security/password-policy.js";

const newPasswordSchema = z
  .string()
  .min(12)
  .max(160)
  .refine(isPasswordWithinBcryptLimit, "Password must be at most 72 UTF-8 bytes");

export const createUserSchema = z.object({
  email: z.string().email().max(254),
  password: newPasswordSchema,
  displayName: z.string().min(2).max(160),
  jobTitle: z.string().max(120).optional(),
  status: z.enum(["INVITED", "ACTIVE", "INACTIVE", "LOCKED"]).optional(),
  preferredLocale: z.enum(["PT_BR", "EN_GB"]).optional(),
  preferredTheme: z.enum(["SYSTEM", "LIGHT", "DARK"]).optional(),
  roleId: z.string().uuid()
});

export const updateUserSchema = createUserSchema
  .omit({ password: true })
  .partial()
  .extend({ password: newPasswordSchema.optional() });
