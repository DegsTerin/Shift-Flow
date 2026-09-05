// en-GB: Verifies report activity filters use real domain values and coherent dates.
import { describe, expect, it } from "vitest";
import { reportFilterSchema, shiftReportUpdateSchema } from "./reports.validators.js";

describe("reportFilterSchema", () => {
  it("rejects unknown activity statuses", () => {
    expect(reportFilterSchema.safeParse({ status: "APPROVED" }).success).toBe(false);
  });

  it("preserves shared civil-date and instant filter categories", () => {
    expect(
      reportFilterSchema.parse({
        from: "2026-09-01",
        to: "2026-09-30T23:59:59.999Z"
      })
    ).toMatchObject({
      from: { kind: "calendar-date", value: "2026-09-01" },
      to: { kind: "instant", value: "2026-09-30T23:59:59.999Z" }
    });
  });

  it("rejects impossible civil dates and offset-less datetimes", () => {
    expect(reportFilterSchema.safeParse({ from: "2026-02-29" }).success).toBe(false);
    expect(reportFilterSchema.safeParse({ to: "2026-09-30T23:59:59" }).success).toBe(false);
  });

  it("rejects lifecycle fields in a generic report patch", () => {
    expect(shiftReportUpdateSchema.safeParse({ status: "APPROVED" }).success).toBe(false);
    expect(shiftReportUpdateSchema.safeParse({ approvedAt: new Date() }).success).toBe(false);
  });

  it("rejects an empty generic report patch", () => {
    expect(shiftReportUpdateSchema.safeParse({}).success).toBe(false);
  });
});
