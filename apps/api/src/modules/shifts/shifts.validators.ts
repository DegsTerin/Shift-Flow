import { z } from "zod";

export const shiftSchema = z.object({
  name: z.string().min(2).max(160),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
  timezone: z.string().min(3).max(64).optional(),
  status: z.enum(["PLANNED", "OPEN", "CLOSED", "REOPENED", "CANCELLED"]).optional()
});

export const coverageSchema = z.object({
  userId: z.string().uuid(),
  replacementForUserId: z.string().uuid().optional(),
  type: z.enum(["REGULAR", "ON_CALL", "VACATION", "SUBSTITUTE", "ABSENCE"]).default("REGULAR"),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
  note: z.string().max(5000).optional()
});
