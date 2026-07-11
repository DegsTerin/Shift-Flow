// en-GB: Provides shared page config definitions so frontend modules use one consistent implementation.
import {
  Activity,
  BarChart3,
  Building2,
  CalendarClock,
  Columns3,
  LayoutDashboard,
  ListChecks,
  ShieldCheck,
  SlidersHorizontal,
  Users,
  Workflow,
  type LucideIcon
} from "lucide-react";
import type { DashboardConfiguration, View } from "./types";

export type MenuItem = {
  id: View;
  icon: LucideIcon;
  resource: string;
  action: string;
};

export const menu: MenuItem[] = [
  { id: "dashboard", icon: LayoutDashboard, resource: "dashboard", action: "read" },
  { id: "team-dashboard", icon: BarChart3, resource: "dashboard", action: "read" },
  { id: "users", icon: Users, resource: "users", action: "read" },
  { id: "clients", icon: Building2, resource: "clients", action: "read" },
  { id: "teams", icon: Workflow, resource: "teams", action: "read" },
  { id: "roles", icon: ShieldCheck, resource: "rbac", action: "read" },
  { id: "shifts", icon: CalendarClock, resource: "shifts", action: "read" },
  { id: "activities", icon: ListChecks, resource: "activities", action: "read" },
  { id: "kanban", icon: Columns3, resource: "activities", action: "read" },
  { id: "reports", icon: Activity, resource: "reports", action: "read" },
  { id: "settings", icon: SlidersHorizontal, resource: "users", action: "read" }
];

export type DashboardLayoutKey = "MAIN" | "TEAM";

export const defaultDashboardLayouts: Record<DashboardLayoutKey, DashboardConfiguration> = {
  MAIN: {
    dashboardType: "MAIN",
    gridColumns: 12,
    gridGap: 16,
    isDefault: true,
    metadata: {},
    widgets: [
      ["summary-total", "SUMMARY_CARD", "Atividades totais", 2, 2],
      ["summary-pending", "SUMMARY_CARD", "Pendentes", 2, 2],
      ["summary-running", "SUMMARY_CARD", "Em andamento", 2, 2],
      ["summary-done", "SUMMARY_CARD", "Finalizadas", 2, 2],
      ["summary-critical", "SUMMARY_CARD", "Criticas", 2, 2],
      ["summary-risk", "INDICATOR", "SLA em risco", 2, 2],
      ["summary-overdue", "SUMMARY_CARD", "Atividades atrasadas", 3, 2],
      ["summary-average-resolution", "INDICATOR", "Tempo medio", 3, 2],
      ["kanban-summary", "BAR_CHART", "Kanban resumido", 6, 3],
      ["operational-alerts", "LIST", "Alertas operacionais", 12, 2],
      ["team-summary", "LIST", "Equipes", 12, 1],
      ["chart-team", "BAR_CHART", "Atividades por equipe", 6, 3],
      ["chart-client", "BAR_CHART", "Atividades por cliente", 6, 3],
      ["chart-priority", "BAR_CHART", "Atividades por prioridade", 6, 3],
      ["chart-shift", "BAR_CHART", "Incidentes por turno", 6, 3],
      ["chart-status", "BAR_CHART", "Evolucao mensal", 6, 3],
      ["status-legend", "INDICATOR", "Legenda de status", 6, 1],
      ["activity-list", "RECENT_ACTIVITIES", "Ultimas atividades", 12, 4]
    ].map(([key, widgetType, title, gridWidth, gridHeight], order) => ({
      key: String(key),
      widgetType: widgetType as DashboardConfiguration["widgets"][number]["widgetType"],
      title: String(title),
      gridColumn: order % 2 === 0 ? 1 : 7,
      gridRow: Math.floor(order / 2) + 1,
      gridWidth: Number(gridWidth),
      gridHeight: Number(gridHeight),
      isVisible: true,
      isPinned: false,
      order,
      refreshIntervalMs: 60000,
      settings: { sourceKey: String(key) }
    }))
  },
  TEAM: {
    dashboardType: "TEAM",
    gridColumns: 12,
    gridGap: 16,
    isDefault: true,
    metadata: {},
    widgets: [
      ["team-summary", "LIST", "Equipes", 12, 2],
      ["team-productivity", "BAR_CHART", "Produtividade por analista", 6, 3],
      ["team-risk", "BAR_CHART", "SLA em risco", 6, 3],
      ["team-activity-list", "RECENT_ACTIVITIES", "Ultimas atividades", 12, 4]
    ].map(([key, widgetType, title, gridWidth, gridHeight], order) => ({
      key: String(key),
      widgetType: widgetType as DashboardConfiguration["widgets"][number]["widgetType"],
      title: String(title),
      gridColumn: order % 2 === 0 ? 1 : 7,
      gridRow: Math.floor(order / 2) + 1,
      gridWidth: Number(gridWidth),
      gridHeight: Number(gridHeight),
      isVisible: true,
      isPinned: false,
      order,
      refreshIntervalMs: 60000,
      settings: { sourceKey: String(key) }
    }))
  }
};
