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
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional()
});

export const dashboardTypeParamSchema = z.object({
  dashboardType: z.enum(["MAIN", "TEAM", "EXECUTIVE"])
});

export const dashboardConfigurationQuerySchema = z.object({
  teamId: z.string().uuid().optional()
});

const dashboardWidgetSchema = z.object({
  id: z.string().uuid().optional(),
  key: z.string().trim().min(1).max(120),
  widgetType: z.enum([
    "SUMMARY_CARD",
    "BAR_CHART",
    "LINE_CHART",
    "PIE_CHART",
    "TABLE",
    "LIST",
    "INDICATOR",
    "CALENDAR",
    "RECENT_ACTIVITIES",
    "CUSTOM"
  ]),
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(255).nullable().optional(),
  gridColumn: z.number().int().min(1).max(12),
  gridRow: z.number().int().min(1).max(100),
  gridWidth: z.number().int().min(1).max(12),
  gridHeight: z.number().int().min(1).max(8),
  isVisible: z.boolean(),
  isPinned: z.boolean(),
  order: z.number().int().min(0).max(1000),
  refreshIntervalMs: z.number().int().min(5000).max(3600000).nullable().optional(),
  settings: z.record(z.string(), z.unknown()).optional(),
  metadata: z.record(z.string(), z.unknown()).optional()
});

export const dashboardConfigurationSchema = z.object({
  dashboardType: z.enum(["MAIN", "TEAM", "EXECUTIVE"]),
  teamId: z.string().uuid().nullable().optional(),
  gridColumns: z.number().int().min(1).max(12).default(12),
  gridGap: z.number().int().min(0).max(48).default(16),
  isDefault: z.boolean().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  widgets: z.array(dashboardWidgetSchema).max(60)
});
