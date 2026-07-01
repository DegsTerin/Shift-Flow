import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(160),
  companyId: z.string().uuid().optional()
});

export const refreshTokenSchema = z.object({}).strict();
