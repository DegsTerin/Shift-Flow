// en-GB: Verifies task-board drop planning without a browser runtime.
import { describe, expect, it, vi } from "vitest";
import type { ActivityTaskBoard } from "../lib/types";
import {
  handleInternalTaskDrop,
  planInternalTaskDrop,
  planInternalTaskStep,
  taskDueAtPayload
} from "./record-modal-task-board";

const board: ActivityTaskBoard = {
  columns: [
    {
      id: "column-a",
      name: "To do",
      position: 0,
      tasks: [
        { id: "task-a", columnId: "column-a", title: "A", position: 0 },
        { id: "task-b", columnId: "column-a", title: "B", position: 1 },
        { id: "task-c", columnId: "column-a", title: "C", position: 2 }
      ]
    },
    {
      id: "column-b",
      name: "Doing",
      position: 1,
      tasks: [{ id: "task-d", columnId: "column-b", title: "D", position: 0 }]
    }
  ]
};

describe("planInternalTaskDrop", () => {
  it("adjusts a downward same-column drop to remain before the target card", () => {
    expect(planInternalTaskDrop(board, "task-a", "column-a", 2)).toEqual({
      taskId: "task-a",
      columnId: "column-a",
      position: 1
    });
  });

  it("keeps an upward same-column target index unchanged", () => {
    expect(planInternalTaskDrop(board, "task-c", "column-a", 0)).toEqual({
      taskId: "task-c",
      columnId: "column-a",
      position: 0
    });
  });

  it("bounds a same-column append after removing the dragged task", () => {
    expect(planInternalTaskDrop(board, "task-a", "column-a", 3)).toEqual({
      taskId: "task-a",
      columnId: "column-a",
      position: 2
    });
  });

  it("returns no command for a drop that preserves the current position", () => {
    expect(planInternalTaskDrop(board, "task-b", "column-a", 1)).toBeNull();
  });

  it("uses the target index directly for a cross-column drop", () => {
    expect(planInternalTaskDrop(board, "task-c", "column-b", 1)).toEqual({
      taskId: "task-c",
      columnId: "column-b",
      position: 1
    });
  });

  it("runs the card-drop wiring once, stops propagation and clears before moving", () => {
    const event = { preventDefault: vi.fn(), stopPropagation: vi.fn() };
    const clearDrag = vi.fn();
    const move = vi.fn();

    handleInternalTaskDrop(event, board, "task-a", "column-a", 2, true, clearDrag, move);

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(event.stopPropagation).toHaveBeenCalledOnce();
    expect(clearDrag).toHaveBeenCalledOnce();
    expect(clearDrag.mock.invocationCallOrder[0]).toBeLessThan(move.mock.invocationCallOrder[0]);
    expect(move).toHaveBeenCalledOnce();
    expect(move).toHaveBeenCalledWith({ taskId: "task-a", columnId: "column-a", position: 1 });
  });

  it("clears a no-op column drop without propagation or a move", () => {
    const event = { preventDefault: vi.fn(), stopPropagation: vi.fn() };
    const clearDrag = vi.fn();
    const move = vi.fn();

    handleInternalTaskDrop(event, board, "task-b", "column-a", 1, false, clearDrag, move);

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(event.stopPropagation).not.toHaveBeenCalled();
    expect(clearDrag).toHaveBeenCalledOnce();
    expect(move).not.toHaveBeenCalled();
  });
});

describe("planInternalTaskStep", () => {
  it("moves a task one position before or after without drag input", () => {
    expect(planInternalTaskStep(board, "task-b", -1)).toEqual({
      taskId: "task-b",
      columnId: "column-a",
      position: 0
    });
    expect(planInternalTaskStep(board, "task-b", 1)).toEqual({
      taskId: "task-b",
      columnId: "column-a",
      position: 2
    });
  });

  it("emits no command beyond either column boundary", () => {
    expect(planInternalTaskStep(board, "task-a", -1)).toBeNull();
    expect(planInternalTaskStep(board, "task-c", 1)).toBeNull();
    expect(planInternalTaskStep(board, "missing", 1)).toBeNull();
  });
});

describe("taskDueAtPayload", () => {
  it("preserves the exact instant when the minute shown by the form is unchanged", () => {
    const previous = "2026-08-30T15:00:34.987Z";
    const date = new Date(previous);
    const localValue = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);

    expect(taskDueAtPayload(localValue, previous, null)).toBe(previous);
  });

  it("converts a changed browser-local value to an explicit ISO instant", () => {
    const localValue = "2026-08-31T09:45";

    expect(taskDueAtPayload(localValue, "2026-08-30T15:00:34.987Z", null)).toBe(
      new Date(localValue).toISOString()
    );
  });

  it("uses the caller's explicit empty representation", () => {
    expect(taskDueAtPayload("", undefined, undefined)).toBeUndefined();
    expect(taskDueAtPayload("", "2026-08-30T15:00:34.987Z", null)).toBeNull();
  });
});
