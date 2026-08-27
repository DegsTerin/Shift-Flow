// en-GB: Exercises Kanban component handlers without requiring a browser runtime.
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import type { ActivityItem, Texts } from "../lib/types";
import { KanbanBoard } from "./views";

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
