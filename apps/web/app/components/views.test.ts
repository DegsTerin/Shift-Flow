// en-GB: Exercises rendered dashboard semantics and Kanban handlers without a browser runtime.
import type { ReactElement, ReactNode } from "react";
import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";
import { messages } from "../lib/i18n";
import type {
  ActivityItem,
  DashboardConfiguration,
  DashboardSummary,
  Locale,
  Texts
} from "../lib/types";
import { defaultDashboardLayouts } from "../lib/page-config";
import type { DashboardAvailability, DashboardResource } from "../lib/page-data";
import type { DashboardWidgetDefinition } from "./custom-dashboard";
import {
  KanbanBoard,
  MainDashboard,
  TeamDashboard,
  kanbanActivityDragType,
  prepareMainDashboardLayout,
  withRequiredWidgets
} from "./views";

// The installed renderer needs only this narrow synchronous HTML contract in the unit suite.
const { renderToStaticMarkup } = createRequire(import.meta.url)("react-dom/server") as {
  renderToStaticMarkup: (node: ReactNode) => string;
};

function dashboardHtml(
  kind: "MAIN" | "TEAM",
  locale: Locale,
  keys: string[],
  summaryPatch: Partial<DashboardSummary> = {},
  availability?: DashboardAvailability,
  teams: Array<{ id: string; name: string }> = []
) {
  const common = {
    t: messages[locale],
    locale,
    teams,
    availability,
    activities: [],
    canConfigure: false,
    charts: {
      byTeam: [{ teamId: "team-a", _count: { _all: 11 } }],
      byClient: [],
      byStatus: [{ status: "PENDING", _count: { _all: 22 } }],
      byPriority: [{ priority: "HIGH", _count: { _all: 33 } }],
      byShift: [{ shiftId: "shift-a", _count: { _all: 44 } }]
    },
    layout: {
      ...defaultDashboardLayouts[kind],
      isDefault: false,
      widgets: defaultDashboardLayouts[kind].widgets.filter((widget) => keys.includes(widget.key))
    },
    onSaveLayout: vi.fn(async () => undefined),
    onResetLayout: vi.fn(async () => undefined)
  };
  return renderToStaticMarkup(
    kind === "MAIN"
      ? MainDashboard({
          ...common,
          summary: {
            total: 0,
            pending: 0,
            inProgress: 0,
            done: 0,
            critical: 0,
            slaAtRisk: 0,
            overdue: 0,
            averageResolutionHours: 2,
            averageResolutionSample: { count: 1, limit: 500, basis: "LATEST_COMPLETED" },
            ...summaryPatch
          }
        })
      : TeamDashboard(common)
  );
}

describe("Dashboard rendered metric semantics", () => {
  const ready: DashboardAvailability = {
    summary: "ready",
    charts: "ready",
    operationalActivities: "ready",
    configuration: "ready",
    teamDirectory: "ready"
  };
  const widgets: Record<Exclude<DashboardResource, "configuration">, string[]> = {
    summary: ["summary-total", "summary-average-resolution", "operational-alerts"],
    charts: ["chart-status", "chart-shift", "kanban-summary"],
    operationalActivities: ["activity-list"],
    teamDirectory: ["team-summary"]
  };
  it.each(["pt-BR", "en-GB"] as const)(
    "renders accessible dependency-specific loading, error and skipped states in %s",
    (locale) => {
      for (const resource of Object.keys(widgets) as Array<keyof typeof widgets>) {
        for (const status of ["loading", "error", "skipped"] as const) {
          const html = dashboardHtml(
            "MAIN",
            locale,
            widgets[resource],
            { total: 99 },
            { ...ready, [resource]: status }
          );
          const message =
            status === "loading"
              ? messages[locale].dashboardDependencyLoading
              : status === "error"
                ? messages[locale].dashboardDependencyError
                : messages[locale].dashboardDependencySkipped;
          expect(html).toContain(message.replaceAll("'", "&#x27;"));
          expect(html).toContain('role="status"');
          expect(html).toContain('aria-live="polite"');
          expect(html).not.toContain("<strong>99</strong>");
          expect(html).not.toContain("<small>OK</small>");
          expect(html).not.toContain("<b>22</b>");
        }
      }
    }
  );

  it.each(["pt-BR", "en-GB"] as const)(
    "retains ready teams without inventing unavailable chart counts in %s",
    (locale) => {
      const html = dashboardHtml(
        "MAIN",
        locale,
        ["team-summary"],
        {},
        { ...ready, charts: "error" },
        [{ id: "team-a", name: "Response team" }]
      );
      expect(html).toContain("Response team");
      expect(html).toContain(`<b>${messages[locale].dashboardCountUnavailable}</b>`);
      expect(html).not.toContain("<b>0</b>");
      expect(html).not.toContain("<b>11</b>");
    }
  );

  it.each(["pt-BR", "en-GB"] as const)(
    "preserves genuine zero and empty results and labels an unavailable layout read-only in %s",
    (locale) => {
      const readyHtml = dashboardHtml(
        "MAIN",
        locale,
        ["summary-total", "team-summary"],
        { total: 0 },
        ready
      );
      expect(readyHtml).toContain("<strong>0</strong>");
      expect(readyHtml).toContain(messages[locale].dashboardDirectoryEmpty);
      const fallback = dashboardHtml(
        "MAIN",
        locale,
        ["summary-total"],
        { total: 5 },
        { ...ready, configuration: "error" }
      );
      expect(fallback).toContain("<strong>5</strong>");
      expect(fallback).toContain(messages[locale].dashboardLayoutReadOnly);
    }
  );

  it.each(["pt-BR", "en-GB"] as const)("renders all four truthful dimensions in %s", (locale) => {
    const labels = messages[locale];
    const main = dashboardHtml("MAIN", locale, ["chart-status", "chart-shift"]);
    const team = dashboardHtml("TEAM", locale, ["team-productivity", "team-risk"]);
    expect(main).toContain(`<h2>${labels.byStatus}</h2>`);
    expect(main).toContain(`<h2>${labels.byShift}</h2>`);
    expect(main).toContain("<b>22</b>");
    expect(main).toContain("<b>44</b>");
    expect(team).toContain(`<h2>${labels.byTeam}</h2>`);
    expect(team).toContain(`<h2>${labels.byPriority}</h2>`);
    expect(team).toContain("<b>11</b>");
    expect(team).toContain("<b>33</b>");
    expect(main).not.toContain(labels.monthly);
    expect(main).not.toContain(labels.incidentsByShift);
    expect(team).not.toContain(labels.productivity);
    expect(team).not.toContain(labels.risk);
  });

  it.each(["pt-BR", "en-GB"] as const)(
    "discloses a bounded valid subset instead of OK in %s",
    (locale) => {
      const html = dashboardHtml("MAIN", locale, ["summary-average-resolution"], {
        averageResolutionHours: 3.5,
        averageResolutionSample: { count: 497, limit: 500, basis: "LATEST_COMPLETED" }
      });
      expect(html).toContain("<strong>3.5 h</strong>");
      expect(html).toContain(
        messages[locale].averageResolutionSampleNote
          .replace("{count}", "497")
          .replace("{limit}", "500")
      );
      expect(html).not.toContain("<small>OK</small>");
    }
  );

  it.each(["pt-BR", "en-GB"] as const)(
    "distinguishes no valid durations from a genuine zero-hour sample in %s",
    (locale) => {
      const empty = dashboardHtml("MAIN", locale, ["summary-average-resolution"], {
        averageResolutionHours: 0,
        averageResolutionSample: { count: 0, limit: 500, basis: "LATEST_COMPLETED" }
      });
      const zero = dashboardHtml("MAIN", locale, ["summary-average-resolution"], {
        averageResolutionHours: 0,
        averageResolutionSample: { count: 1, limit: 500, basis: "LATEST_COMPLETED" }
      });
      expect(empty).toContain(`<strong>${messages[locale].averageResolutionUnavailable}</strong>`);
      expect(empty).not.toContain("<strong>0 h</strong>");
      expect(zero).toContain("<strong>0 h</strong>");
    }
  );

  it.each(["pt-BR", "en-GB"] as const)(
    "does not invent sample details for an older response in %s",
    (locale) => {
      const html = dashboardHtml("MAIN", locale, ["summary-average-resolution"], {
        averageResolutionSample: undefined
      });
      expect(html).toContain(messages[locale].averageResolutionSampleUnknown);
      expect(html).toContain(`<strong>${messages[locale].averageResolutionUnavailable}</strong>`);
      expect(html).not.toContain("500");
      expect(html).not.toContain("<strong>2 h</strong>");
    }
  );

  it("does not display an incoherent sample as an observed mean", () => {
    const html = dashboardHtml("MAIN", "en-GB", ["summary-average-resolution"], {
      averageResolutionSample: { count: 501, limit: 500, basis: "LATEST_COMPLETED" }
    });
    expect(html).toContain(messages["en-GB"].averageResolutionSampleUnknown);
    expect(html).not.toContain("<strong>2 h</strong>");
  });
});

const activities: ActivityItem[] = [{ id: "activity-1", title: "Incident", status: "PENDING" }];

function renderBoard(
  dragged: string | null,
  setDragged: (value: string | null) => void,
  onMove: (id: string, status: string) => void,
  onPage = vi.fn(),
  canMove = true
) {
  return KanbanBoard({
    t: messages["en-GB"] as Texts,
    activities,
    dragged,
    setDragged,
    canMove,
    onMove,
    onOpen: vi.fn(),
    pagination: { page: 1, pageSize: 100, total: 101, onPage }
  });
}

function childElements(node: unknown): ReactElement[] {
  if (Array.isArray(node)) return node.flatMap(childElements);
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const element = node as ReactElement;
  return [element, ...childElements((element.props as { children?: unknown }).children)];
}

function textOf(node: unknown): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join(" ");
  if (!node || typeof node !== "object" || !("props" in node)) return "";
  return textOf(((node as ReactElement).props as { children?: unknown }).children);
}

function fakeDataTransfer(entries: Record<string, string> = {}) {
  const values = new Map(Object.entries(entries));
  return {
    get types() {
      return [...values.keys()];
    },
    effectAllowed: "none",
    dropEffect: "none",
    getData: (type: string) => values.get(type) ?? "",
    setData: (type: string, value: string) => values.set(type, value)
  } as unknown as DataTransfer;
}

function dropOnColumn(board: ReactElement, columnIndex: number, dataTransfer: DataTransfer) {
  const grid = (board.props as { children: ReactElement[] }).children[0];
  const columns = (grid.props as { children: ReactElement[] }).children;
  const column = columns[columnIndex];
  const preventDefault = vi.fn();
  (
    column.props as {
      onDrop: (event: { dataTransfer: DataTransfer; preventDefault: () => void }) => void;
    }
  ).onDrop({ dataTransfer, preventDefault });
  return { column, preventDefault };
}

describe("KanbanBoard drop handling", () => {
  it("clears drag state without moving a card dropped in its current column", () => {
    const setDragged = vi.fn();
    const onMove = vi.fn();

    dropOnColumn(
      renderBoard("activity-1", setDragged, onMove),
      0,
      fakeDataTransfer({ [kanbanActivityDragType]: "activity-1" })
    );

    expect(setDragged).toHaveBeenCalledOnce();
    expect(setDragged).toHaveBeenCalledWith(null);
    expect(onMove).not.toHaveBeenCalled();
  });

  it("clears drag state and emits exactly one genuine status move", () => {
    const setDragged = vi.fn();
    const onMove = vi.fn();

    dropOnColumn(
      renderBoard("activity-1", setDragged, onMove),
      1,
      fakeDataTransfer({ [kanbanActivityDragType]: "activity-1" })
    );

    expect(setDragged).toHaveBeenCalledOnce();
    expect(setDragged).toHaveBeenCalledWith(null);
    expect(onMove).toHaveBeenCalledOnce();
    expect(onMove).toHaveBeenCalledWith("activity-1", "IN_PROGRESS");
  });

  it("clears a stale drag without accepting an external drop", () => {
    const setDragged = vi.fn();
    const onMove = vi.fn();

    const { preventDefault } = dropOnColumn(
      renderBoard("activity-1", setDragged, onMove),
      1,
      fakeDataTransfer({ "text/plain": "external", Files: "file" })
    );

    expect(preventDefault).not.toHaveBeenCalled();
    expect(setDragged).toHaveBeenCalledWith(null);
    expect(onMove).not.toHaveBeenCalled();
  });

  it("writes a private drag marker and clears it when dragging ends", () => {
    const setDragged = vi.fn();
    const board = renderBoard(null, setDragged, vi.fn());
    const card = childElements(board).find(
      (element) =>
        element.type === "div" &&
        (element.props as { className?: string }).className === "kanban-card"
    );
    if (!card) throw new Error("Kanban card was not found");
    const dataTransfer = fakeDataTransfer();

    (
      card.props as {
        onDragStart: (event: { dataTransfer: DataTransfer }) => void;
        onDragEnd: () => void;
      }
    ).onDragStart({ dataTransfer });
    expect(dataTransfer.getData(kanbanActivityDragType)).toBe("activity-1");
    expect(dataTransfer.effectAllowed).toBe("move");
    expect(setDragged).toHaveBeenLastCalledWith("activity-1");

    (
      card.props as {
        onDragEnd: () => void;
      }
    ).onDragEnd();
    expect(setDragged).toHaveBeenLastCalledWith(null);
  });

  it("accepts dragover only for the private Kanban marker", () => {
    const board = renderBoard(null, vi.fn(), vi.fn());
    const grid = (board.props as { children: ReactElement[] }).children[0];
    const column = (grid.props as { children: ReactElement[] }).children[0];
    const onDragOver = (
      column.props as {
        onDragOver: (event: { dataTransfer: DataTransfer; preventDefault: () => void }) => void;
      }
    ).onDragOver;
    const internalPreventDefault = vi.fn();
    const internalTransfer = fakeDataTransfer({ [kanbanActivityDragType]: "activity-1" });
    onDragOver({ dataTransfer: internalTransfer, preventDefault: internalPreventDefault });
    expect(internalPreventDefault).toHaveBeenCalledOnce();
    expect(internalTransfer.dropEffect).toBe("move");

    const externalPreventDefault = vi.fn();
    onDragOver({
      dataTransfer: fakeDataTransfer({ "text/plain": "external" }),
      preventDefault: externalPreventDefault
    });
    expect(externalPreventDefault).not.toHaveBeenCalled();
  });

  it("keeps cards non-draggable and rejects internal moves without write permission", () => {
    const setDragged = vi.fn();
    const onMove = vi.fn();
    const board = renderBoard("activity-1", setDragged, onMove, vi.fn(), false);
    const grid = (board.props as { children: ReactElement[] }).children[0];
    const column = (grid.props as { children: ReactElement[] }).children[0];
    const card = childElements(board).find(
      (element) =>
        element.type === "div" &&
        (element.props as { className?: string }).className === "kanban-card"
    );
    const internalTransfer = fakeDataTransfer({ [kanbanActivityDragType]: "activity-1" });
    const preventDefault = vi.fn();

    expect((card?.props as { draggable?: boolean }).draggable).toBe(false);
    (
      column.props as {
        onDragOver: (event: { dataTransfer: DataTransfer; preventDefault: () => void }) => void;
      }
    ).onDragOver({ dataTransfer: internalTransfer, preventDefault });
    expect(preventDefault).not.toHaveBeenCalled();
    expect(internalTransfer.dropEffect).not.toBe("move");
    dropOnColumn(board, 1, fakeDataTransfer({ [kanbanActivityDragType]: "activity-1" }));
    expect(onMove).not.toHaveBeenCalled();
    expect(setDragged).toHaveBeenCalledWith(null);
  });

  it("offers one semantic open action and one discriminant keyboard status control", () => {
    const onOpen = vi.fn();
    const onMove = vi.fn();
    const board = KanbanBoard({
      t: messages["en-GB"] as Texts,
      activities,
      dragged: null,
      setDragged: vi.fn(),
      canMove: true,
      onMove,
      onOpen,
      pagination: { page: 1, pageSize: 100, total: 1, onPage: vi.fn() }
    });
    const open = childElements(board).find(
      (element) =>
        element.type === "button" &&
        (element.props as { className?: string }).className === "kanban-open-button"
    );
    const status = childElements(board).find(
      (element) =>
        element.type === "select" &&
        (element.props as { "aria-label"?: string })["aria-label"]?.includes(
          messages["en-GB"].moveToStatus
        )
    );
    if (!open || !status) throw new Error("Accessible Kanban controls were not found");

    (open.props as { onClick: () => void }).onClick();
    (status.props as { onChange: (event: { target: { value: string } }) => void }).onChange({
      target: { value: "PENDING" }
    });
    expect(onMove).not.toHaveBeenCalled();
    (status.props as { onChange: (event: { target: { value: string } }) => void }).onChange({
      target: { value: "IN_PROGRESS" }
    });

    expect(onOpen).toHaveBeenCalledOnce();
    expect(onOpen).toHaveBeenCalledWith(activities[0]);
    expect(onMove).toHaveBeenCalledOnce();
    expect(onMove).toHaveBeenCalledWith("activity-1", "IN_PROGRESS");
  });

  it("removes the keyboard status control when move authority is absent", () => {
    const board = renderBoard(null, vi.fn(), vi.fn(), vi.fn(), false);

    expect(
      childElements(board).some(
        (element) =>
          element.type === "select" &&
          (element.props as { "aria-label"?: string })["aria-label"]?.includes(
            messages["en-GB"].moveToStatus
          )
      )
    ).toBe(false);
  });

  it("converts the real Kanban footer next action to API page two", () => {
    const onPage = vi.fn();
    const board = renderBoard(null, vi.fn(), vi.fn(), onPage);
    const footerElement = (board.props as { children: ReactElement[] }).children[1];
    const footer = (footerElement.type as (props: unknown) => ReactElement)(footerElement.props);
    const next = childElements(footer).find(
      (element) => element.type === "button" && textOf(element).trim() === messages["en-GB"].next
    );

    (next?.props as { onClick?: () => void }).onClick?.();

    expect(onPage).toHaveBeenCalledOnce();
    expect(onPage).toHaveBeenCalledWith(2);
  });
});

describe("withRequiredWidgets", () => {
  it("appends a required widget after the maximum sparse order", () => {
    const layout: DashboardConfiguration = {
      dashboardType: "MAIN",
      gridColumns: 12,
      gridGap: 16,
      widgets: [
        {
          key: "existing-a",
          widgetType: "SUMMARY_CARD",
          title: "A",
          gridColumn: 1,
          gridRow: 1,
          gridWidth: 2,
          gridHeight: 2,
          isVisible: true,
          isPinned: false,
          order: 0
        },
        {
          key: "existing-b",
          widgetType: "SUMMARY_CARD",
          title: "B",
          gridColumn: 3,
          gridRow: 1,
          gridWidth: 2,
          gridHeight: 2,
          isVisible: true,
          isPinned: false,
          order: 2
        }
      ]
    };
    const definition: DashboardWidgetDefinition = {
      key: "required",
      title: "Required",
      widgetType: "INDICATOR",
      defaultWidth: 3,
      defaultHeight: 2,
      render: () => null
    };

    const result = withRequiredWidgets(layout, [definition]);

    expect(result.widgets.find((widget) => widget.key === "required")?.order).toBe(3);
  });

  it("does not restore a deleted widget in an explicitly customised main dashboard", () => {
    const layout: DashboardConfiguration = {
      dashboardType: "MAIN",
      gridColumns: 12,
      gridGap: 16,
      isDefault: false,
      widgets: []
    };
    const definition: DashboardWidgetDefinition = {
      key: "deleted-widget",
      title: "Deleted",
      widgetType: "INDICATOR",
      defaultWidth: 3,
      defaultHeight: 2,
      render: () => null
    };

    const result = prepareMainDashboardLayout(layout, "Teams", [definition]);

    expect(result).toBe(layout);
    expect(result.widgets).toEqual([]);
  });

  it("hydrates required widgets only for a virtual or reset default main dashboard", () => {
    const layout: DashboardConfiguration = {
      dashboardType: "MAIN",
      gridColumns: 12,
      gridGap: 16,
      isDefault: true,
      widgets: []
    };
    const definition: DashboardWidgetDefinition = {
      key: "required-widget",
      title: "Required",
      widgetType: "INDICATOR",
      defaultWidth: 3,
      defaultHeight: 2,
      render: () => null
    };

    const result = prepareMainDashboardLayout(layout, "Teams", [definition]);

    expect(result.widgets.map((widget) => widget.key)).toEqual(["team-summary", "required-widget"]);
  });
});
