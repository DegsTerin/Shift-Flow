import { z } from "zod";

export const activitySchema = z.object({
  clientId: z.string().uuid(),
  teamId: z.string().uuid(),
  shiftId: z.string().uuid().optional(),
  assigneeId: z.string().uuid().optional(),
  reporterId: z.string().uuid().optional(),
  title: z.string().min(2).max(220),
  description: z.string().max(10000).optional(),
  systemName: z.string().max(120).optional(),
  status: z
    .enum(["PENDING", "IN_PROGRESS", "WAITING_THIRD_PARTY", "MONITORING", "DONE", "CANCELLED"])
    .optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
  slaDueAt: z.coerce.date().optional(),
});

export const moveActivitySchema = z.object({
  status: z.enum(["PENDING", "IN_PROGRESS", "WAITING_THIRD_PARTY", "MONITORING", "DONE", "CANCELLED"]),
  note: z.string().max(5000).optional(),
});

export const assignActivitySchema = z.object({
  assigneeId: z.string().uuid().nullable(),
  note: z.string().max(5000).optional(),
});
