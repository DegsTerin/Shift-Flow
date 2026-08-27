// en-GB: Defines dashboard transfer shapes so data crossing application boundaries remains explicit.
export type DashboardFiltersDto = {
  teamId?: string;
  assigneeId?: string;
  clientId?: string;
  priority?: string;
  status?: string;
  shiftId?: string;
  search?: string;
  attention?: "OVERDUE" | "CRITICAL" | "SLA_RISK";
  from?: Date;
  to?: Date;
};

export type DashboardTypeDto = "MAIN" | "TEAM" | "EXECUTIVE";

export type DashboardWidgetTypeDto =
  | "SUMMARY_CARD"
  | "BAR_CHART"
  | "LINE_CHART"
  | "PIE_CHART"
  | "TABLE"
  | "LIST"
  | "INDICATOR"
  | "CALENDAR"
  | "RECENT_ACTIVITIES"
  | "CUSTOM";

export type DashboardWidgetDto = {
  id?: string;
  key: string;
  widgetType: DashboardWidgetTypeDto;
  title: string;
  description?: string | null;
  gridColumn: number;
  gridRow: number;
  gridWidth: number;
  gridHeight: number;
  isVisible: boolean;
  isPinned: boolean;
  order: number;
  refreshIntervalMs?: number | null;
  settings?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
};

export type DashboardConfigurationDto = {
  id?: string;
  dashboardType: DashboardTypeDto;
  teamId?: string | null;
  gridColumns: number;
  gridGap: number;
  isDefault?: boolean;
  metadata?: Record<string, unknown>;
  widgets: DashboardWidgetDto[];
};
