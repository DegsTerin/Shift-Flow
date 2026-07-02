export type DashboardFiltersDto = {
  teamId?: string;
  assigneeId?: string;
  clientId?: string;
  priority?: string;
  status?: string;
  shiftId?: string;
};

export type DashboardTypeDto = "MAIN" | "TEAM" | "EXECUTIVE";

export type DashboardWidgetDto = {
  id?: string;
  key: string;
  widgetType: string;
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
