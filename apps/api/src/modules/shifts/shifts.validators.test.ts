// en-GB: Verifies strict Shift period and timezone HTTP validation.
import { describe, expect, it } from "vitest";
import { shiftCreateSchema, shiftUpdateSchema } from "./shifts.validators.js";

const shift = { name: "Day shift", startsAt: "2026-09-04T09:00", endsAt: "2026-09-04T17:00" };

describe("Shift temporal validation", () => {
  it.each(["PLANNED", "OPEN"])("accepts the initial state %s", (status) => {
    expect(shiftCreateSchema.parse({ ...shift, status }).status).toBe(status);
  });

  it.each(["CLOSED", "REOPENED", "CANCELLED", "UNKNOWN", null, 0, true])(
    "rejects invalid initial status %j",
    (status) => {
      expect(shiftCreateSchema.safeParse({ ...shift, status }).success).toBe(false);
    }
  );

  it.each(["closedAt", "reopenedAt"])("rejects direct %s injection on creation", (field) => {
    expect(shiftCreateSchema.safeParse({ ...shift, [field]: "2026-09-04T10:00:00Z" }).success).toBe(
      false
    );
  });

  it("preserves local wall-clock strings and allows a missing create timezone", () => {
    expect(shiftCreateSchema.parse(shift)).toEqual(shift);
  });

  it.each([null, true, 0, new Date(0), "2026-09-04", "2026-02-30T09:00", "2026-09-04T09:00:60Z"])(
    "rejects invalid temporal value %j on create and partial update",
    (value) => {
      for (const field of ["startsAt", "endsAt"]) {
        expect(shiftCreateSchema.safeParse({ ...shift, [field]: value }).success).toBe(false);
        expect(shiftUpdateSchema.safeParse({ [field]: value }).success).toBe(false);
      }
    }
  );

  it.each(["Invalid/Zone", "+03:00", "UTC ", null])("rejects invalid timezone %j", (timezone) => {
    expect(shiftCreateSchema.safeParse({ ...shift, timezone }).success).toBe(false);
    expect(shiftUpdateSchema.safeParse({ timezone }).success).toBe(false);
  });

  it("accepts timezone-only and explicit-instant partial updates without coercion", () => {
    expect(shiftUpdateSchema.parse({ timezone: "Europe/London" })).toEqual({
      timezone: "Europe/London"
    });
    expect(shiftUpdateSchema.parse({ startsAt: "2026-09-04t10:20:30.123456789012z" })).toEqual({
      startsAt: "2026-09-04t10:20:30.123456789012z"
    });
  });
});
