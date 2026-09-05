// en-GB: Resolves query date ranges without losing civil-date timezone semantics.
import { Temporal } from "@js-temporal/polyfill";
import { z } from "zod";
import { AppError, badRequest } from "../errors/app-error.js";
import { getDelegate } from "../lib/prisma.js";

const calendarDatePattern = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/;
const rfc3339InstantPattern =
  /^(\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])[Tt](?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d)(?:\.(\d+))?([Zz]|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;

type CalendarDateBound = {
  kind: "calendar-date";
  value: string;
};

type InstantBound = {
  kind: "instant";
  value: string;
};

export type QueryDateBound = CalendarDateBound | InstantBound;

export function parseRfc3339Instant(value: string) {
  const match = rfc3339InstantPattern.exec(value);
  if (!match || match[0] !== value) {
    throw new RangeError("Invalid RFC3339 instant");
  }

  const [, dateTime, fraction, offset] = match;
  const normalised =
    fraction && fraction.length > 9 ? `${dateTime}.${fraction.slice(0, 9)}${offset}` : value;
  return Temporal.Instant.from(normalised);
}

export const queryDateBoundSchema = z.string().transform<QueryDateBound>((value, context) => {
  if (calendarDatePattern.test(value)) {
    try {
      Temporal.PlainDate.from(value);
      return { kind: "calendar-date", value };
    } catch {
      context.addIssue({ code: "custom", message: "Date must be a real YYYY-MM-DD value" });
      return z.NEVER;
    }
  }

  if (rfc3339InstantPattern.test(value)) {
    try {
      parseRfc3339Instant(value);
      return { kind: "instant", value };
    } catch {
      context.addIssue({
        code: "custom",
        message: "Datetime must be a real RFC3339 value with an explicit offset"
      });
      return z.NEVER;
    }
  }

  context.addIssue({
    code: "custom",
    message: "Expected YYYY-MM-DD or RFC3339 datetime with an explicit offset"
  });
  return z.NEVER;
});

export const dateRangeQuerySchema = z.object({
  from: queryDateBoundSchema.optional(),
  to: queryDateBoundSchema.optional()
});

export type DateRangeQuery = z.output<typeof dateRangeQuerySchema>;

export type ResolvedDateRange = {
  gte?: Date;
  lt?: Date;
  lte?: Date;
};

type CompanyTimezoneDelegate = {
  findFirst(args: {
    where: { id: string; status: "ACTIVE"; deletedAt: null };
    select: { timezone: true };
  }): Promise<{ timezone: string } | null>;
};

function companyTimezoneUnavailable() {
  return new AppError(
    "Active company timezone is unavailable",
    503,
    "COMPANY_TIMEZONE_UNAVAILABLE"
  );
}

export async function loadCompanyTimezone(companyId: string) {
  let company: { timezone: string } | null;
  try {
    const delegate = await getDelegate<CompanyTimezoneDelegate>("company");
    company = await delegate.findFirst({
      where: { id: companyId, status: "ACTIVE", deletedAt: null },
      select: { timezone: true }
    });
  } catch {
    throw companyTimezoneUnavailable();
  }

  if (!company || typeof company.timezone !== "string" || !company.timezone.trim()) {
    throw companyTimezoneUnavailable();
  }

  const timezone = company.timezone;
  if (/^[+-]/.test(timezone)) {
    throw companyTimezoneUnavailable();
  }
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: timezone }).format(0);
  } catch {
    throw companyTimezoneUnavailable();
  }
  return timezone;
}

function instantDate(value: string) {
  return new Date(parseRfc3339Instant(value).epochMilliseconds);
}

function civilStartDate(value: string, timezone: string, addDays = 0) {
  try {
    const date = Temporal.PlainDate.from(value).add({ days: addDays });
    // A civil day starts at its first instant, even when midnight is skipped or repeated.
    const start = date.toZonedDateTime(timezone);
    if (addDays === 0 && !start.toPlainDate().equals(date)) {
      throw new RangeError("Selected civil date does not exist");
    }
    // An exclusive boundary may cross a skipped next-day label after a valid selected day.
    return new Date(start.epochMilliseconds);
  } catch {
    throw badRequest("Date range cannot be resolved in the active company timezone");
  }
}

function assertResolvedOrder(range: ResolvedDateRange) {
  if (!range.gte) return;
  if (range.lt && range.gte.getTime() >= range.lt.getTime()) {
    throw badRequest("Date range is empty or inverted");
  }
  if (range.lte && range.gte.getTime() > range.lte.getTime()) {
    throw badRequest("Date range is inverted");
  }
}

export async function resolveDateRange(
  companyId: string,
  bounds: DateRangeQuery
): Promise<ResolvedDateRange | undefined> {
  const { from, to } = bounds;
  if (!from && !to) return undefined;

  const needsTimezone = from?.kind === "calendar-date" || to?.kind === "calendar-date";
  const timezone = needsTimezone ? await loadCompanyTimezone(companyId) : undefined;
  const range: ResolvedDateRange = {};

  if (from) {
    range.gte =
      from.kind === "calendar-date"
        ? civilStartDate(from.value, timezone as string)
        : instantDate(from.value);
  }
  if (to) {
    if (to.kind === "calendar-date") {
      civilStartDate(to.value, timezone as string);
      range.lt = civilStartDate(to.value, timezone as string, 1);
    } else {
      range.lte = instantDate(to.value);
    }
  }

  assertResolvedOrder(range);
  return range;
}
