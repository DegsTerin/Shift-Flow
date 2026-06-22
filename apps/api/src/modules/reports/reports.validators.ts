import { z } from "zod";

export const reportFilterSchema = z.object({
  teamId: z.string().uuid().optional(),
  clientId: z.string().uuid().optional(),
  shiftId: z.string().uuid().optional(),
  status: z.string().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export const shiftReportSchema = z.object({
  shiftId: z.string().uuid(),
  teamId: z.string().uuid(),
  summary: z.string().min(1).max(20000),
  pendingNotes: z.string().max(10000).optional(),
  metrics: z.record(z.string(), z.unknown()).optional(),
});
