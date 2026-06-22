import { z } from "zod";

export const teamSchema = z.object({
  name: z.string().min(2).max(160),
  description: z.string().max(5000).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  defaultSlaMinutes: z.number().int().positive().optional(),
});

export const teamMemberSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(["LEADER", "MEMBER"]).default("MEMBER"),
  startsAt: z.coerce.date().optional(),
  endsAt: z.coerce.date().optional(),
});
