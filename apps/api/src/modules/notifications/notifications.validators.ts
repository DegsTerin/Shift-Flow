import { z } from "zod";

export const notificationSchema = z.object({
  recipientId: z.string().uuid(),
  clientId: z.string().uuid().optional(),
  teamId: z.string().uuid().optional(),
  shiftId: z.string().uuid().optional(),
  activityId: z.string().uuid().optional(),
  type: z.enum([
    "ACTIVITY_ASSIGNED",
    "ACTIVITY_STATUS_CHANGED",
    "SLA_AT_RISK",
    "SLA_BREACHED",
    "COMMENT_ADDED",
    "SHIFT_REPORT_READY",
    "SYSTEM"
  ]),
  priority: z.enum(["LOW", "NORMAL", "HIGH"]).optional(),
  channel: z.enum(["IN_APP", "EMAIL"]).optional(),
  title: z.string().min(2).max(180),
  body: z.string().max(5000).optional()
});
