// en-GB: Verifies explicit-zone form rendering and lossless unchanged-minute payloads.
import { describe, expect, it } from "vitest";
import {
  datetimeFieldPayload,
  isNamedTimezone,
  zonedDateInputValue,
  zonedDatetimeInstant
} from "./zoned-datetime";

describe("zonedDatetimeInstant", () => {
  it.each([
    ["2026-09-04T09:00", "Europe/London", "2026-09-04T08:00:00.000Z"],
    ["2026-01-04T09:00:01.123456789", "Europe/London", "2026-01-04T09:00:01.123Z"],
    ["2026-09-04T09:00:01.123", "America/Sao_Paulo", "2026-09-04T12:00:01.123Z"],
    ["2026-09-04T09:00", "UTC", "2026-09-04T09:00:00.000Z"]
  ])("converts %s explicitly in %s", (value, timezone, expected) => {
    expect(zonedDatetimeInstant(value, timezone)).toBe(expected);
  });
  it.each([
    "2026-03-29T01:30",
    "2026-10-25T01:30",
    "2026-02-30T09:00",
    "2026-09-04T24:00",
    "2026-09-04T09:00:60",
    "2026-09-04T09:00\n",
    "2026-09-04T09:00Z",
    "2026-09-04T09:00+01:00",
    "2026-09-04",
    ""
  ])("rejects impossible, non-local or ambiguous input %s", (value) => {
    expect(() => zonedDatetimeInstant(value, "Europe/London")).toThrow(RangeError);
  });
  it.each([undefined, "", "Invalid/Zone", "+01:00"])(
    "refuses implicit or invalid timezone %s",
    (timezone) => {
      expect(() => zonedDatetimeInstant("2026-09-04T09:00", timezone)).toThrow(RangeError);
    }
  );
});

describe("zonedDateInputValue", () => {
  it.each([
    ["2026-08-30T15:00:34.987Z", "America/Sao_Paulo", "2026-08-30T12:00"],
    ["2026-08-30t15:00:34.987z", "Europe/London", "2026-08-30T16:00"],
    ["2026-01-30T15:00:34.987+02:00", "Europe/London", "2026-01-30T13:00"],
    ["2026-08-30T01:00:34.987Z", "America/Sao_Paulo", "2026-08-29T22:00"],
    ["2026-11-01T05:30:34.987Z", "America/New_York", "2026-11-01T01:30"],
    ["2026-11-01T06:30:34.987Z", "America/New_York", "2026-11-01T01:30"]
  ])("renders %s in %s", (instant, timezone, expected) => {
    expect(zonedDateInputValue(instant, timezone)).toBe(expected);
  });

  it.each([undefined, "", "Invalid/Zone", "+02:00", " Europe/London "])(
    "does not substitute a browser zone for %s",
    (timezone) => {
      expect(isNamedTimezone(timezone)).toBe(false);
      expect(zonedDateInputValue("2026-08-30T15:00:00Z", timezone)).toBe("");
    }
  );

  it("rejects an invalid instant and supports an explicit UTC zone", () => {
    expect(zonedDateInputValue("not-a-date", "UTC")).toBe("");
    expect(zonedDateInputValue(new Date("2026-08-30T15:00:34.987Z"), "UTC")).toBe(
      "2026-08-30T15:00"
    );
  });
});

describe("datetimeFieldPayload", () => {
  it.each(["2026-11-01T05:30:34.987Z", "2026-11-01T06:30:34.987Z"])(
    "preserves the exact fold occurrence %s by omitting an unchanged field",
    (original) => {
      const form = new FormData();
      form.set("date", zonedDateInputValue(original, "America/New_York"));
      expect(datetimeFieldPayload(form, "date", original, "America/New_York")).toBeUndefined();
    }
  );

  it.each(["2026-08-30T12:00", "2026-08-30T12:00:00", "2026-08-30T12:00:00.000"])(
    "recognises the unchanged displayed minute %s",
    (value) => {
      const form = new FormData();
      form.set("date", value);
      expect(
        datetimeFieldPayload(form, "date", "2026-08-30T15:00:34.987Z", "America/Sao_Paulo")
      ).toBeUndefined();
    }
  );

  it("distinguishes missing input, explicit clearing and a changed wall clock", () => {
    const form = new FormData();
    const original = "2026-08-30T15:00:34.987Z";
    expect(datetimeFieldPayload(form, "date", original)).toBeUndefined();
    form.set("date", "");
    expect(datetimeFieldPayload(form, "date", original)).toBeNull();
    form.set("date", "2026-08-30T12:01");
    expect(datetimeFieldPayload(form, "date", original, "America/Sao_Paulo")).toBe(
      "2026-08-30T12:01"
    );
  });

  it.each([
    "2026-03-08T02:30",
    "2026-11-01T01:45",
    "2026-08-30T12:00:01",
    "2026-08-30T12:00:00+02:00"
  ])("leaves changed or ambiguous input %s for server validation", (value) => {
    const form = new FormData();
    form.set("date", value);
    expect(
      datetimeFieldPayload(form, "date", "2026-08-30T15:00:34.987Z", "America/Sao_Paulo")
    ).toBe(value);
  });
});
