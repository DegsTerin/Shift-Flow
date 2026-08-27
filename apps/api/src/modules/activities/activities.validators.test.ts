// en-GB: Verifies bounded activity filters and command notes.
import { describe, expect, it } from "vitest";
import {
  activityFilterSchema,
  activityNoteSchema,
  reorderTaskColumnsSchema,
  restoreActivityTaskSchema,
  updateActivityTaskColumnSchema,
  updateActivityTaskSchema
} from "./activities.validators.js";

const firstId = "c40e2a7b-72a8-4aca-a780-d6d239134d38";
const secondId = "93d913f9-d743-49ac-a814-33f32dbf9eb2";

describe("activity validators", () => {
  it("coerces a valid filter interval", () => {
    const result = activityFilterSchema.safeParse({
      clientId: "c40e2a7b-72a8-4aca-a780-d6d239134d38",
      from: "2026-08-01T00:00:00.000Z",
      to: "2026-08-31T23:59:59.000Z"
    });

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.from).toBeInstanceOf(Date);
  });

  it.each([
    { clientId: "not-a-uuid" },
    { priority: "URGENT" },
    { from: "2026-09-01T00:00:00.000Z", to: "2026-08-01T00:00:00.000Z" }
  ])("rejects an invalid filter", (filter) => {
    expect(activityFilterSchema.safeParse(filter).success).toBe(false);
  });

  it("rejects an unbounded lifecycle note", () => {
    expect(activityNoteSchema.safeParse({ note: "x".repeat(5001) }).success).toBe(false);
  });

  it("keeps close and reopen compatible with an omitted request body", () => {
    expect(activityNoteSchema.parse(undefined)).toEqual({});
  });

  it("requires a complete unique task-column permutation payload", () => {
    expect(reorderTaskColumnsSchema.safeParse({ columnIds: [firstId, secondId] }).success).toBe(
      true
    );
    expect(reorderTaskColumnsSchema.safeParse({ columnIds: [firstId, firstId] }).success).toBe(
      false
    );
    expect(
      reorderTaskColumnsSchema.safeParse({
        columnIds: [firstId, firstId.toUpperCase()]
      }).success
    ).toBe(false);
  });

  it("rejects empty column edits and direct position changes", () => {
    expect(updateActivityTaskColumnSchema.safeParse({ name: "Review" }).success).toBe(true);
    expect(updateActivityTaskColumnSchema.safeParse({}).success).toBe(false);
    expect(updateActivityTaskColumnSchema.safeParse({ position: 2 }).success).toBe(false);
  });

  it("keeps web-compatible task edits while rejecting direct lifecycle fields", () => {
    expect(
      updateActivityTaskSchema.safeParse({
        columnId: firstId,
        title: "Updated task",
        description: null,
        assigneeId: secondId,
        priority: "HIGH",
        dueAt: "2026-08-30T15:00:00.000Z",
        labels: ["incident", "owner"],
        attachmentIds: [secondId]
      }).success
    ).toBe(true);
    expect(updateActivityTaskSchema.safeParse({}).success).toBe(false);
    expect(updateActivityTaskSchema.safeParse({ position: 2 }).success).toBe(false);
    expect(updateActivityTaskSchema.safeParse({ completedAt: new Date() }).success).toBe(false);
    expect(
      updateActivityTaskSchema.safeParse({ attachmentIds: [secondId, secondId] }).success
    ).toBe(false);
  });

  it("canonicalises an optional restore destination", () => {
    expect(restoreActivityTaskSchema.parse({ columnId: firstId.toUpperCase() })).toEqual({
      columnId: firstId
    });
    expect(restoreActivityTaskSchema.parse(undefined)).toEqual({});
  });
});
