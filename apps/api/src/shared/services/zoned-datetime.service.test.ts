// en-GB: Proves strict temporal bodies, timezone isolation and unambiguous instant resolution.
import { beforeEach, describe, expect, it, vi } from "vitest";

const prisma = vi.hoisted(() => ({ getDelegate: vi.fn() }));
vi.mock("../lib/prisma.js", () => ({ getDelegate: prisma.getDelegate }));

import {
  bodyDatetimeSchema,
  resolveCompanyDatetime,
  resolveZonedDatetime,
  timezoneSchema
} from "./zoned-datetime.service.js";

const findFirst = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  findFirst.mockResolvedValue({ timezone: "Europe/London" });
  prisma.getDelegate.mockResolvedValue({ findFirst });
});

describe("bodyDatetimeSchema", () => {
  it.each([
    null,
    true,
    false,
    0,
    1750000000000,
    {},
    [],
    new Date(0),
    "",
    "2026-09-04",
    "2026-02-30T10:00",
    "2026-01-01T24:00",
    "2026-01-01T10:60",
    "2026-01-01T10:00:60",
    "2026-01-01T10:00.5",
    "2026-01-01T10:00Z",
    "2026-01-01T10:00:00+24:00",
    "2026-01-01T10:00:00+01:60",
    "2026-01-01T10:00:00Z ",
    "2026-01-01T10:00\n",
    "2026-01-01T10:00:00[Europe/London]"
  ])("rejects malformed HTTP value %j", (value) => {
    expect(bodyDatetimeSchema.safeParse(value).success).toBe(false);
  });

  it.each([
    "2024-02-29T12:34",
    "2026-09-04t10:20:30.123456789012",
    "2026-09-04T10:20:30Z",
    "2026-09-04t10:20:30.123456789012z",
    "2026-09-04T10:20:30.1+02:30"
  ])("preserves valid lexical value %s until service resolution", (value) => {
    expect(bodyDatetimeSchema.parse(value)).toBe(value);
  });
});

describe("timezoneSchema", () => {
  it.each(["Europe/London", "America/Sao_Paulo", "UTC", "Asia/Kathmandu"])(
    "accepts %s",
    (value) => {
      expect(timezoneSchema.safeParse(value).success).toBe(true);
    }
  );
  it.each(["", "Invalid/Zone", "+01:00", "-03:00", " Europe/London", "UTC ", null, 1])(
    "rejects %j",
    (value) => {
      expect(timezoneSchema.safeParse(value).success).toBe(false);
    }
  );
});

describe("zoned datetime resolution", () => {
  it("resolves a normal London summer wall time with its millisecond precision", () => {
    expect(resolveZonedDatetime("2026-07-04T10:20:30.123456789012", "Europe/London")).toEqual(
      new Date("2026-07-04T09:20:30.123Z")
    );
  });

  it.each(["2026-03-29T01:30", "2026-10-25T01:30"])(
    "rejects London's missing or repeated wall time %s",
    (value) => {
      expect(() => resolveZonedDatetime(value, "Europe/London")).toThrow(
        "Datetime cannot be resolved unambiguously in the selected timezone"
      );
    }
  );

  it("preserves an explicit lower-case offset instant without looking up Company", async () => {
    await expect(
      resolveCompanyDatetime("company-a", "2026-07-04t10:20:30.123456789012+02:30")
    ).resolves.toEqual(new Date("2026-07-04T07:50:30.123Z"));
    expect(prisma.getDelegate).not.toHaveBeenCalled();
  });

  it("uses only the authenticated active Company's timezone for local values", async () => {
    await expect(resolveCompanyDatetime("company-a", "2026-07-04T10:20")).resolves.toEqual(
      new Date("2026-07-04T09:20:00Z")
    );
    expect(prisma.getDelegate).toHaveBeenCalledWith("company");
    expect(findFirst).toHaveBeenCalledWith({
      where: { id: "company-a", status: "ACTIVE", deletedAt: null },
      select: { timezone: true }
    });
  });

  it.each([null, { timezone: "Invalid/Zone" }, { timezone: "+03:00" }, { timezone: "" }])(
    "normalises unavailable Company metadata %j",
    async (company) => {
      findFirst.mockResolvedValueOnce(company);
      await expect(resolveCompanyDatetime("company-a", "2026-07-04T10:20")).rejects.toMatchObject({
        statusCode: 503,
        code: "COMPANY_TIMEZONE_UNAVAILABLE",
        message: "Active company timezone is unavailable"
      });
    }
  );

  it("does not leak the underlying Company lookup error", async () => {
    findFirst.mockRejectedValueOnce(new Error("private connection detail"));
    await expect(resolveCompanyDatetime("company-a", "2026-07-04T10:20")).rejects.toMatchObject({
      statusCode: 503,
      message: "Active company timezone is unavailable"
    });
  });

  it("retains trusted finite Date compatibility but rejects an invalid Date", async () => {
    const original = new Date("2026-07-04T10:20:30.987Z");
    const resolved = await resolveCompanyDatetime("company-a", original);
    expect(resolved).toEqual(original);
    expect(resolved).not.toBe(original);
    expect(prisma.getDelegate).not.toHaveBeenCalled();
    expect(() => resolveZonedDatetime(new Date(Number.NaN), "UTC")).toThrow();
  });
});
