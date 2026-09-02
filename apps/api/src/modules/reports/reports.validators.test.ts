// en-GB: Verifies report activity filters use real domain values and coherent dates.
import { describe, expect, it } from "vitest";
import { reportFilterSchema, shiftReportUpdateSchema } from "./reports.validators.js";

describe("reportFilterSchema", () => {
  it("rejects unknown activity statuses", () => {
    expect(reportFilterSchema.safeParse({ status: "APPROVED" }).success).toBe(false);
  });

  it("rejects an inverted reporting interval", () => {
    expect(
      reportFilterSchema.safeParse({
        from: "2026-09-01T00:00:00.000Z",
        to: "2026-08-01T00:00:00.000Z"
      }).success
    ).toBe(false);
  });

  it("rejects lifecycle fields in a generic report patch", () => {
    expect(shiftReportUpdateSchema.safeParse({ status: "APPROVED" }).success).toBe(false);
    expect(shiftReportUpdateSchema.safeParse({ approvedAt: new Date() }).success).toBe(false);
  });
});
