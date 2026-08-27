// en-GB: Validates activities input so malformed data cannot cross the module boundary.
import { z } from "zod";

const activityStatusSchema = z.enum([
  "PENDING",
  "IN_PROGRESS",
  "WAITING_CUSTOMER",
  "WAITING_THIRD_PARTY",
  "MONITORING",
  "DONE",
  "CANCELLED"
]);

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
  status: activityStatusSchema.optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
  slaDueAt: z.coerce.date().optional()
});

export const moveActivitySchema = z.object({
  status: activityStatusSchema,
  note: z.string().max(5000).optional()
});

export const activityNoteSchema = z
  .object({
    note: z.string().max(5000).optional()
  })
  .default({});

export const activityFilterSchema = z
  .object({
    clientId: z.string().uuid().optional(),
    teamId: z.string().uuid().optional(),
    shiftId: z.string().uuid().optional(),
    assigneeId: z.string().uuid().optional(),
    priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
    status: activityStatusSchema.optional(),
    attention: z.enum(["OVERDUE", "CRITICAL", "SLA_RISK"]).optional(),
    search: z.string().trim().max(200).optional(),
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

export const assignActivitySchema = z.object({
  assigneeId: z.string().uuid().nullable(),
  note: z.string().max(5000).optional()
});

export const activityTaskColumnSchema = z.object({
  name: z.string().min(2).max(120),
  color: z.string().max(16).optional(),
  position: z.number().int().min(0).optional()
});

export const reorderTaskColumnsSchema = z.object({
  columnIds: z.array(z.string().uuid()).min(1).max(100)
});

export const activityTaskSchema = z.object({
  columnId: z.string().uuid(),
  assigneeId: z.string().uuid().nullable().optional(),
  title: z.string().min(2).max(220),
  description: z.string().max(10000).optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
  labels: z.array(z.string().min(1).max(60)).max(12).optional(),
  attachmentIds: z.array(z.string().uuid()).max(20).optional(),
  position: z.number().int().min(0).optional(),
  dueAt: z.coerce.date().nullable().optional(),
  completedAt: z.coerce.date().nullable().optional()
});

export const moveActivityTaskSchema = z.object({
  columnId: z.string().uuid(),
  position: z.number().int().min(0),
  note: z.string().max(5000).optional()
});
