import { z } from "zod";

export const dashboardFilterSchema = z.object({
  teamId: z.string().uuid().optional(),
  assigneeId: z.string().uuid().optional(),
  clientId: z.string().uuid().optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
  status: z
    .enum([
      "PENDING",
      "IN_PROGRESS",
      "WAITING_CUSTOMER",
      "WAITING_THIRD_PARTY",
      "MONITORING",
      "DONE",
      "CANCELLED"
    ])
    .optional(),
  shiftId: z.string().uuid().optional(),
  search: z.string().max(200).optional(),
  from: z.string().optional(),
  to: z.string().optional()
});
