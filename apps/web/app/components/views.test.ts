// en-GB: Exercises Kanban component handlers without requiring a browser runtime.
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import type { ActivityItem, DashboardConfiguration, Texts } from "../lib/types";
import type { DashboardWidgetDefinition } from "./custom-dashboard";
import { KanbanBoard, withRequiredWidgets } from "./views";

const activities: ActivityItem[] = [{ id: "activity-1", title: "Incident", status: "PENDING" }];

function renderBoard(
  dragged: string | null,
  setDragged: (value: string | null) => void,
  onMove: (id: string, status: string) => void
) {
  return KanbanBoard({
    t: {} as Texts,
    activities,
    dragged,
    setDragged,
    onMove,
    onOpen: vi.fn()
  });
}

function dropOnColumn(board: ReactElement, columnIndex: number) {
  const columns = (board.props as { children: ReactElement[] }).children;
  const column = columns[columnIndex];
  (column.props as { onDrop: () => void }).onDrop();
}

describe("KanbanBoard drop handling", () => {
  it("clears drag state without moving a card dropped in its current column", () => {
    const setDragged = vi.fn();
    const onMove = vi.fn();

    dropOnColumn(renderBoard("activity-1", setDragged, onMove), 0);

    expect(setDragged).toHaveBeenCalledOnce();
    expect(setDragged).toHaveBeenCalledWith(null);
    expect(onMove).not.toHaveBeenCalled();
  });

  it("clears drag state and emits exactly one genuine status move", () => {
    const setDragged = vi.fn();
    const onMove = vi.fn();

    dropOnColumn(renderBoard("activity-1", setDragged, onMove), 1);

    expect(setDragged).toHaveBeenCalledOnce();
    expect(setDragged).toHaveBeenCalledWith(null);
    expect(onMove).toHaveBeenCalledOnce();
    expect(onMove).toHaveBeenCalledWith("activity-1", "IN_PROGRESS");
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
});
