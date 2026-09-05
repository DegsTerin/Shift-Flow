// en-GB: Validates reports input so malformed data cannot cross the module boundary.
import { z } from "zod";
import { dateRangeQuerySchema } from "../../shared/services/date-range.service.js";

export const reportFilterSchema = dateRangeQuerySchema.extend({
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
    .optional()
});

export const shiftReportSchema = z
  .object({
    shiftId: z.string().uuid(),
    teamId: z.string().uuid(),
    summary: z.string().min(1).max(20000),
    pendingNotes: z.string().max(10000).optional(),
    metrics: z.record(z.string(), z.unknown()).optional()
  })
  .strict();

export const shiftReportUpdateSchema = shiftReportSchema
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, "At least one report field is required");
