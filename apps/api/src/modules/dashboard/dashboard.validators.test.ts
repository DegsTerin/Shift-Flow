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
