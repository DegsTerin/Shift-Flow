// en-GB: Verifies dashboard filter bounds before analytical queries run.
import { describe, expect, it } from "vitest";
import { dashboardConfigurationSchema, dashboardFilterSchema } from "./dashboard.validators.js";

function widget(key: string, order: number) {
  return {
    key,
    widgetType: "SUMMARY_CARD",
    title: key,
    gridColumn: 1,
    gridRow: order + 1,
    gridWidth: 2,
    gridHeight: 2,
    isVisible: true,
    isPinned: false,
    order
  };
}

describe("dashboardFilterSchema", () => {
  it("preserves shared civil-date and instant filter categories", () => {
    expect(
      dashboardFilterSchema.parse({
        from: "2026-09-01",
        to: "2026-09-30T23:59:59.123-03:00"
      })
    ).toMatchObject({
      from: { kind: "calendar-date", value: "2026-09-01" },
      to: { kind: "instant", value: "2026-09-30T23:59:59.123-03:00" }
    });
  });

  it("rejects impossible civil dates and offset-less datetimes", () => {
    expect(dashboardFilterSchema.safeParse({ from: "2026-02-30" }).success).toBe(false);
    expect(dashboardFilterSchema.safeParse({ to: "2026-09-30T23:59:59" }).success).toBe(false);
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

describe("dashboardConfigurationSchema", () => {
  it("rejects duplicate instance keys", () => {
    const result = dashboardConfigurationSchema.safeParse({
      dashboardType: "MAIN",
      widgets: [widget("summary-total", 0), widget("summary-total", 1)]
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toEqual(
        expect.arrayContaining([expect.objectContaining({ path: ["widgets", 1, "key"] })])
      );
    }
  });

  it("accepts legacy duplicate orders for deterministic service normalisation", () => {
    const result = dashboardConfigurationSchema.safeParse({
      dashboardType: "MAIN",
      widgets: [widget("summary-total", 0), widget("summary-pending", 0)]
    });

    expect(result.success).toBe(true);
  });
});
