// en-GB: Verifies deterministic task-board rules independently from persistence.
import { describe, expect, it } from "vitest";
import {
  boundedPosition,
  changedTaskData,
  isDoneColumn,
  numericPosition,
  taskSnapshot,
  valuesEqual
} from "./activity-task-board.rules.js";

const assigneeId = "70965bb0-c40a-4609-86e9-7ec2aac622f7";
const attachmentIds = [
  "29a6f168-0f63-4547-a7cd-689b88435a59",
  "73d7bc97-2f23-4236-a6b5-4989d022c137"
];

describe("activity task-board rules", () => {
  it("reads numeric positions and preserves the existing fallback", () => {
    expect(numericPosition({ id: "positioned", position: 4 })).toBe(4);
    expect(numericPosition({ id: "missing" })).toBe(0);
    expect(numericPosition({ id: "text", position: "4" })).toBe(0);
  });

  it("bounds requested positions and defaults missing values to the end", () => {
    expect(boundedPosition(undefined, 4)).toBe(4);
    expect(boundedPosition(-2, 4)).toBe(0);
    expect(boundedPosition(2, 4)).toBe(2);
    expect(boundedPosition(8, 4)).toBe(4);
  });

  it("classifies canonical, trimmed and decomposed completion names", () => {
    const decomposedName = "  CONCLUI\u0301DO  ";

    expect(isDoneColumn({ id: "done", name: "Done" })).toBe(true);
    expect(isDoneColumn({ id: "trimmed", name: " done " })).toBe(true);
    expect(isDoneColumn({ id: "decomposed", name: decomposedName })).toBe(true);
    expect(isDoneColumn({ id: "doing", name: "Doing" })).toBe(false);
    expect(decomposedName).toBe("  CONCLUI\u0301DO  ");
  });

  it("compares dates and arrays without changing array-order semantics", () => {
    const instant = new Date("2026-08-30T15:00:00.000Z");

    expect(valuesEqual([instant, "owner"], [new Date(instant), "owner"])).toBe(true);
    expect(valuesEqual(["incident", "owner"], ["owner", "incident"])).toBe(false);
  });

  it("creates an exact whitelisted snapshot with ISO dates and ordered arrays", () => {
    const dueAt = new Date("2026-09-01T10:00:00.000Z");
    const completedAt = new Date("2026-09-01T11:00:00.000Z");
    const createdAt = new Date("2026-08-30T09:00:00.000Z");
    const updatedAt = new Date("2026-08-30T10:00:00.000Z");
    const source = {
      id: "task-1",
      companyId: "company-1",
      activityId: "activity-1",
      columnId: "column-1",
      assigneeId,
      title: "Investigate",
      description: "Preserve evidence",
      priority: "HIGH",
      labels: ["incident", "owner"],
      attachmentIds,
      position: 2,
      dueAt,
      completedAt,
      archivedAt: null,
      createdAt,
      updatedAt,
      deletedAt: null,
      unexpected: "must not leak"
    };

    expect(taskSnapshot(source)).toEqual({
      id: "task-1",
      companyId: "company-1",
      activityId: "activity-1",
      columnId: "column-1",
      assigneeId,
      title: "Investigate",
      description: "Preserve evidence",
      priority: "HIGH",
      labels: ["incident", "owner"],
      attachmentIds,
      position: 2,
      dueAt: dueAt.toISOString(),
      completedAt: completedAt.toISOString(),
      archivedAt: null,
      createdAt: createdAt.toISOString(),
      updatedAt: updatedAt.toISOString(),
      deletedAt: null
    });
    expect(source.dueAt).toBe(dueAt);
    expect(source.attachmentIds).toBe(attachmentIds);
  });

  it("canonicalises mutable identifiers without mutating input or admitting other fields", () => {
    const dueAt = new Date("2026-09-01T10:00:00.000Z");
    const previous = {
      id: "task-1",
      title: "Before",
      description: "Before",
      assigneeId,
      priority: "HIGH",
      labels: ["incident", "owner"],
      attachmentIds,
      dueAt
    };
    const input = {
      title: "Before",
      description: "After",
      assigneeId: assigneeId.toUpperCase(),
      priority: "HIGH",
      labels: ["incident", "owner"],
      attachmentIds: attachmentIds.map((id) => id.toUpperCase()),
      dueAt: new Date(dueAt),
      columnId: "ignored-column",
      archivedAt: new Date(),
      unexpected: "ignored"
    };

    expect(changedTaskData(previous, input)).toEqual({ description: "After" });
    expect(input.assigneeId).toBe(assigneeId.toUpperCase());
    expect(input.attachmentIds).toEqual(attachmentIds.map((id) => id.toUpperCase()));
    expect(input.dueAt).not.toBe(dueAt);
  });

  it("retains ordered-array changes while canonicalising attachment identifiers", () => {
    const previous = {
      id: "task-1",
      labels: ["incident", "owner"],
      attachmentIds
    };

    expect(
      changedTaskData(previous, {
        labels: ["owner", "incident"],
        attachmentIds: [attachmentIds[1].toUpperCase(), attachmentIds[0].toUpperCase()]
      })
    ).toEqual({
      labels: ["owner", "incident"],
      attachmentIds: [attachmentIds[1], attachmentIds[0]]
    });
  });
});
