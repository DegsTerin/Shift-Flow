import { z } from "zod";

export const activitySchema = z.object({
  clientId: z.string().uuid(),
  teamId: z.string().uuid(),
  shiftId: z.string().uuid().optional(),
  assigneeId: z.string().uuid().optional(),
  reporterId: z.string().uuid().optional(),
  title: z.string().min(2).max(220),
  description: z.string().max(10000).optional(),
  requested: z.string().max(10000).optional(),
  performed: z.string().max(10000).optional(),
  inProgressDetail: z.string().max(10000).optional(),
  pendingDetail: z.string().max(10000).optional(),
  finalizationDetail: z.string().max(10000).optional(),
  observations: z.string().max(10000).optional(),
  systemName: z.string().max(120).optional(),
  serviceName: z.string().max(120).optional(),
  status: z
    .enum(["PENDING", "IN_PROGRESS", "WAITING_CUSTOMER", "WAITING_THIRD_PARTY", "MONITORING", "DONE", "CANCELLED"])
    .optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
  slaDueAt: z.coerce.date().optional(),
});

export const moveActivitySchema = z.object({
  status: z.enum(["PENDING", "IN_PROGRESS", "WAITING_CUSTOMER", "WAITING_THIRD_PARTY", "MONITORING", "DONE", "CANCELLED"]),
  note: z.string().max(5000).optional(),
});

export const assignActivitySchema = z.object({
  assigneeId: z.string().uuid().nullable(),
  note: z.string().max(5000).optional(),
});
