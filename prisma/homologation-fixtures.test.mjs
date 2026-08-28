// en-GB: Verifies homologation fixtures exercise future, at-risk and overdue dashboard partitions deterministically.
import { describe, expect, it } from "vitest";
import {
  buildHomologationFixturePlan,
  homologationReferenceFilters,
  homologationSlaDueAt,
  homologationStatuses,
  parseHomologationActivityCount
} from "./homologation-fixtures.mjs";

describe("homologation fixture timing", () => {
  it("accepts only a bounded positive integer fixture volume", () => {
    expect(parseHomologationActivityCount(undefined)).toBe(120);
    expect(parseHomologationActivityCount("1")).toBe(1);
    expect(parseHomologationActivityCount("1000")).toBe(1000);
    for (const invalid of ["", "0", "-1", "1.5", "NaN", "1001", "9007199254740992"]) {
      expect(() => parseHomologationActivityCount(invalid)).toThrow(
        "HOMOLOGATION_ACTIVITY_COUNT must be an integer between 1 and 1000."
      );
    }
  });

  it("scopes every named homologation reference to the selected company", () => {
    const filters = homologationReferenceFilters("company-a", "admin@example.com");

    expect(filters.client).toMatchObject({ companyId: "company-a", name: "Integration Client" });
    expect(filters.team).toMatchObject({
      companyId: "company-a",
      name: "Integration Operations"
    });
    expect(filters.shift).toMatchObject({
      companyId: "company-a",
      name: "Integration Day Shift"
    });
    expect(filters.admin).toMatchObject({
      email: "admin@example.com",
      companies: { some: { companyId: "company-a", deletedAt: null } }
    });
    expect(filters.analyst).toMatchObject({
      companies: { some: { companyId: "company-a", deletedAt: null } }
    });
  });

  it("creates overdue active work at a stable interval", () => {
    const now = new Date("2026-08-28T12:00:00.000Z");
    const overdueIndexes = Array.from({ length: 120 }, (_, index) => index + 1).filter(
      (index) => homologationSlaDueAt(now, index) < now
    );

    expect(overdueIndexes).toHaveLength(12);
    for (const index of overdueIndexes) {
      expect(homologationStatuses[index % homologationStatuses.length]).not.toBe("DONE");
    }
  });

  it("keeps the remaining SLA deadlines in the future, including the at-risk window", () => {
    const now = new Date("2026-08-28T12:00:00.000Z");
    expect(homologationSlaDueAt(now, 1).getTime() - now.getTime()).toBe(60 * 60 * 1000);
    expect(homologationSlaDueAt(now, 2).getTime()).toBeGreaterThan(now.getTime());
  });

  it("routes an existing overdue fixture through deterministic reconciliation", () => {
    const now = new Date("2026-08-28T12:00:00.000Z");
    const plan = buildHomologationFixturePlan(
      [{ id: "existing-10", title: "Homologation volume activity 010" }],
      now,
      10
    );

    expect(plan.filter((fixture) => fixture.existingId)).toEqual([
      expect.objectContaining({
        existingId: "existing-10",
        index: 10,
        status: "MONITORING",
        completedAt: null
      })
    ]);
    expect(plan[9].slaDueAt).toEqual(new Date("2026-08-28T11:30:00.000Z"));
  });
});
