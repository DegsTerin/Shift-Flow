// en-GB: Proves civil-date, explicit-instant and tenant-timezone range semantics.
import { beforeEach, describe, expect, it, vi } from "vitest";

const prisma = vi.hoisted(() => ({
  getDelegate: vi.fn()
}));

vi.mock("../lib/prisma.js", () => ({ getDelegate: prisma.getDelegate }));

import {
  dateRangeQuerySchema,
  resolveDateRange,
  type DateRangeQuery
} from "./date-range.service.js";

const companyId = "c40e2a7b-72a8-4aca-a780-d6d239134d38";
const findFirst = vi.fn();

const calendar = (value: string) => ({ kind: "calendar-date", value }) as const;
const instant = (value: string) => ({ kind: "instant", value }) as const;

beforeEach(() => {
  vi.clearAllMocks();
  findFirst.mockResolvedValue({ timezone: "America/Sao_Paulo" });
  prisma.getDelegate.mockResolvedValue({ findFirst });
});

describe("dateRangeQuerySchema", () => {
  it("preserves canonical calendar dates as a distinct lexical category", () => {
    expect(dateRangeQuerySchema.parse({ from: "2024-02-29", to: "2026-08-31" })).toEqual({
      from: calendar("2024-02-29"),
      to: calendar("2026-08-31")
    });
  });

  it.each(["2023-02-29", "2026-02-30", "2026-2-01", "2026-08-01 "])(
    "rejects non-canonical or impossible calendar date %s",
    (value) => {
      expect(dateRangeQuerySchema.safeParse({ from: value }).success).toBe(false);
    }
  );

  it("preserves RFC3339 offset instants and milliseconds", () => {
    expect(
      dateRangeQuerySchema.parse({
        from: "2026-08-01T01:02:03.123+02:30",
        to: "2026-08-31T23:59:59Z"
      })
    ).toEqual({
      from: instant("2026-08-01T01:02:03.123+02:30"),
      to: instant("2026-08-31T23:59:59Z")
    });
  });

  it("retains and resolves a one-digit RFC3339 fractional second", async () => {
    const value = "2026-08-01T01:02:03.1Z";
    const parsed = dateRangeQuerySchema.parse({ from: value });

    expect(parsed.from).toEqual(instant(value));
    await expect(resolveDateRange(companyId, parsed)).resolves.toEqual({
      gte: new Date("2026-08-01T01:02:03.100Z")
    });
    expect(prisma.getDelegate).not.toHaveBeenCalled();
  });

  it.each([
    { value: "2026-08-01t01:02:03+02:30", expected: "2026-07-31T22:32:03.000Z" },
    { value: "2026-08-01T01:02:03z", expected: "2026-08-01T01:02:03.000Z" },
    { value: "2026-08-01t01:02:03.123456789012z", expected: "2026-08-01T01:02:03.123Z" }
  ])("preserves RFC3339 lower-case markers in $value", async ({ value, expected }) => {
    const parsed = dateRangeQuerySchema.parse({ from: value, to: value });

    expect(parsed).toEqual({ from: instant(value), to: instant(value) });
    await expect(resolveDateRange(companyId, parsed)).resolves.toEqual({
      gte: new Date(expected),
      lte: new Date(expected)
    });
    expect(prisma.getDelegate).not.toHaveBeenCalled();
  });

  it.each([
    {
      value: "2026-08-01T01:02:03.1234Z",
      expected: "2026-08-01T01:02:03.123Z"
    },
    {
      value: "2026-08-01T01:02:03.987654321+02:30",
      expected: "2026-07-31T22:32:03.987Z"
    },
    {
      value: "2026-08-01T01:02:03.456789123999Z",
      expected: "2026-08-01T01:02:03.456Z"
    }
  ])("retains and resolves RFC3339 fractional precision in $value", async ({ value, expected }) => {
    const parsed = dateRangeQuerySchema.parse({ from: value });

    expect(parsed.from).toEqual(instant(value));
    await expect(resolveDateRange(companyId, parsed)).resolves.toEqual({
      gte: new Date(expected)
    });
    expect(prisma.getDelegate).not.toHaveBeenCalled();
  });

  it.each(
    [
      { offsetName: "Z", value: "2026-08-01T01:02:03.123456789012Z" },
      { offsetName: "numeric-offset", value: "2026-08-01T01:02:03.123456789012+02:30" }
    ].flatMap(({ offsetName, value }) =>
      [
        { terminatorName: "LF", suffix: "\n" },
        { terminatorName: "CR", suffix: "\r" },
        { terminatorName: "CRLF", suffix: "\r\n" },
        { terminatorName: "U+2028", suffix: "\u2028" },
        { terminatorName: "U+2029", suffix: "\u2029" }
      ].map(({ terminatorName, suffix }) => ({ offsetName, value, terminatorName, suffix }))
    )
  )(
    "rejects a long-fraction $offsetName instant followed by $terminatorName",
    ({ value, suffix }) => {
      expect(dateRangeQuerySchema.safeParse({ from: `${value}${suffix}` }).success).toBe(false);
    }
  );

  it.each([
    "2026-08-01T01:02:03",
    "2026-08-01 01:02:03Z",
    "2026-08-01T24:00:00Z",
    "2026-02-30T01:02:03Z",
    "2016-12-31T23:59:60Z"
  ])("rejects invalid or offset-less datetime %s", (value) => {
    expect(dateRangeQuerySchema.safeParse({ from: value }).success).toBe(false);
  });
});

describe("resolveDateRange", () => {
  it("resolves a Sao Paulo civil day as an exclusive next-midnight range", async () => {
    await expect(
      resolveDateRange(companyId, {
        from: calendar("2026-08-15"),
        to: calendar("2026-08-15")
      })
    ).resolves.toEqual({
      gte: new Date("2026-08-15T03:00:00.000Z"),
      lt: new Date("2026-08-16T03:00:00.000Z")
    });

    expect(findFirst).toHaveBeenCalledWith({
      where: { id: companyId, status: "ACTIVE", deletedAt: null },
      select: { timezone: true }
    });
    expect(prisma.getDelegate).toHaveBeenCalledWith("company");
  });

  it.each([
    {
      timezone: "America/New_York",
      date: "2026-03-08",
      start: "2026-03-08T05:00:00.000Z",
      end: "2026-03-09T04:00:00.000Z",
      hours: 23
    },
    {
      timezone: "America/New_York",
      date: "2026-11-01",
      start: "2026-11-01T04:00:00.000Z",
      end: "2026-11-02T05:00:00.000Z",
      hours: 25
    },
    {
      timezone: "Europe/London",
      date: "2026-03-29",
      start: "2026-03-29T00:00:00.000Z",
      end: "2026-03-29T23:00:00.000Z",
      hours: 23
    },
    {
      timezone: "Europe/London",
      date: "2026-10-25",
      start: "2026-10-24T23:00:00.000Z",
      end: "2026-10-26T00:00:00.000Z",
      hours: 25
    },
    {
      timezone: "America/Sao_Paulo",
      date: "2018-11-04",
      start: "2018-11-04T03:00:00.000Z",
      end: "2018-11-05T02:00:00.000Z",
      hours: 23
    },
    {
      timezone: "America/Havana",
      date: "2026-11-01",
      start: "2026-11-01T04:00:00.000Z",
      end: "2026-11-02T05:00:00.000Z",
      hours: 25
    }
  ])(
    "resolves a $hours-hour civil day across DST",
    async ({ timezone, date, start, end, hours }) => {
      findFirst.mockResolvedValueOnce({ timezone });

      const result = await resolveDateRange(companyId, {
        from: calendar(date),
        to: calendar(date)
      });

      expect(result).toEqual({ gte: new Date(start), lt: new Date(end) });
      expect((result?.lt?.getTime() ?? 0) - (result?.gte?.getTime() ?? 0)).toBe(
        hours * 60 * 60 * 1000
      );
    }
  );

  it("supports one-sided civil bounds", async () => {
    await expect(resolveDateRange(companyId, { from: calendar("2026-08-15") })).resolves.toEqual({
      gte: new Date("2026-08-15T03:00:00.000Z")
    });
    await expect(resolveDateRange(companyId, { to: calendar("2026-08-15") })).resolves.toEqual({
      lt: new Date("2026-08-16T03:00:00.000Z")
    });
  });

  it.each([
    { timezone: "America/Sao_Paulo", date: "2018-11-03", end: "2018-11-04T03:00:00.000Z" },
    { timezone: "America/Havana", date: "2026-10-31", end: "2026-11-01T04:00:00.000Z" },
    { timezone: "Pacific/Apia", date: "2011-12-29", end: "2011-12-30T10:00:00.000Z" }
  ])(
    "ends a valid $timezone day at the next actual day boundary",
    async ({ timezone, date, end }) => {
      findFirst.mockResolvedValueOnce({ timezone });

      await expect(resolveDateRange(companyId, { to: calendar(date) })).resolves.toEqual({
        lt: new Date(end)
      });
    }
  );

  it("keeps timestamp-only bounds exact, inclusive and independent of Company", async () => {
    prisma.getDelegate.mockRejectedValue(new Error("Company must not be queried"));
    const bounds: DateRangeQuery = {
      from: instant("2026-08-01T01:02:03.123+02:30"),
      to: instant("2026-07-31T22:32:03.123Z")
    };

    await expect(resolveDateRange(companyId, bounds)).resolves.toEqual({
      gte: new Date("2026-07-31T22:32:03.123Z"),
      lte: new Date("2026-07-31T22:32:03.123Z")
    });
    expect(prisma.getDelegate).not.toHaveBeenCalled();
  });

  it("returns no predicate and performs no Company lookup without bounds", async () => {
    await expect(resolveDateRange(companyId, {})).resolves.toBeUndefined();
    expect(prisma.getDelegate).not.toHaveBeenCalled();
  });

  it("validates mixed inclusive equality only after timezone resolution", async () => {
    await expect(
      resolveDateRange(companyId, {
        from: calendar("2026-08-15"),
        to: instant("2026-08-15T03:00:00.000Z")
      })
    ).resolves.toEqual({
      gte: new Date("2026-08-15T03:00:00.000Z"),
      lte: new Date("2026-08-15T03:00:00.000Z")
    });
  });

  it("rejects an empty or inverted range against a civil exclusive upper bound", async () => {
    await expect(
      resolveDateRange(companyId, {
        from: instant("2026-08-16T03:00:00.000Z"),
        to: calendar("2026-08-15")
      })
    ).rejects.toMatchObject({ statusCode: 400, code: "BAD_REQUEST" });
  });

  it("rejects an inverted explicit-instant range while allowing equal instants", async () => {
    await expect(
      resolveDateRange(companyId, {
        from: instant("2026-08-01T00:00:00.001Z"),
        to: instant("2026-08-01T00:00:00.000Z")
      })
    ).rejects.toMatchObject({ statusCode: 400, code: "BAD_REQUEST" });
    await expect(
      resolveDateRange(companyId, {
        from: instant("2026-08-01T00:00:00.000Z"),
        to: instant("2026-08-01T00:00:00.000Z")
      })
    ).resolves.toEqual({
      gte: new Date("2026-08-01T00:00:00.000Z"),
      lte: new Date("2026-08-01T00:00:00.000Z")
    });
  });

  it.each([null, { timezone: "" }, { timezone: "Not/AZone" }, { timezone: "+03:00" }])(
    "fails closed for missing, blank or invalid Company timezone %#",
    async (company) => {
      findFirst.mockResolvedValueOnce(company);
      await expect(
        resolveDateRange(companyId, { from: calendar("2026-08-15") })
      ).rejects.toMatchObject({
        statusCode: 503,
        code: "COMPANY_TIMEZONE_UNAVAILABLE",
        message: "Active company timezone is unavailable"
      });
    }
  );

  it("sanitises Company lookup failures", async () => {
    findFirst.mockRejectedValueOnce(new Error("database-host.internal:5432 secret detail"));

    await expect(
      resolveDateRange(companyId, { from: calendar("2026-08-15") })
    ).rejects.toMatchObject({
      statusCode: 503,
      code: "COMPANY_TIMEZONE_UNAVAILABLE",
      message: "Active company timezone is unavailable",
      details: undefined
    });
  });

  it("rejects a skipped civil date instead of applying Temporal disambiguation", async () => {
    findFirst.mockResolvedValueOnce({ timezone: "Pacific/Apia" });

    await expect(
      resolveDateRange(companyId, {
        from: calendar("2011-12-30"),
        to: calendar("2011-12-30")
      })
    ).rejects.toMatchObject({ statusCode: 400, code: "BAD_REQUEST" });
  });

  it("rejects an only-to skipped civil date before deriving its exclusive upper bound", async () => {
    findFirst.mockResolvedValueOnce({ timezone: "Pacific/Apia" });

    await expect(resolveDateRange(companyId, { to: calendar("2011-12-30") })).rejects.toMatchObject(
      { statusCode: 400, code: "BAD_REQUEST" }
    );
  });
});
