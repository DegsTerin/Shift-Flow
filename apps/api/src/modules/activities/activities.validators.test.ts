// en-GB: Verifies bounded activity filters and command notes.
import { describe, expect, it } from "vitest";
import { activityFilterSchema, activityNoteSchema } from "./activities.validators.js";

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
});
