// en-GB: Verifies dashboard filter bounds before analytical queries run.
import { describe, expect, it } from "vitest";
import { dashboardFilterSchema } from "./dashboard.validators.js";

describe("dashboardFilterSchema", () => {
  it("rejects an inverted date interval", () => {
    expect(
      dashboardFilterSchema.safeParse({
        from: "2026-09-01T00:00:00.000Z",
        to: "2026-08-01T00:00:00.000Z"
      }).success
    ).toBe(false);
  });

  it("accepts combinable status, priority and attention filters", () => {
    expect(
      dashboardFilterSchema.safeParse({
        status: "PENDING",
        priority: "LOW",
        attention: "CRITICAL"
      }).success
    ).toBe(true);
  });
});
