// en-GB: Validates reports input so malformed data cannot cross the module boundary.
import { z } from "zod";

export const reportFilterSchema = z
  .object({
    teamId: z.string().uuid().optional(),
    clientId: z.string().uuid().optional(),
    shiftId: z.string().uuid().optional(),
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
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional()
  })
  .superRefine((value, context) => {
    if (value.from && value.to && value.to < value.from) {
      context.addIssue({
        code: "custom",
        path: ["to"],
        message: "to must not be earlier than from"
      });
    }
  });

export const shiftReportSchema = z.object({
  shiftId: z.string().uuid(),
  teamId: z.string().uuid(),
  summary: z.string().min(1).max(20000),
  pendingNotes: z.string().max(10000).optional(),
  metrics: z.record(z.string(), z.unknown()).optional()
});
