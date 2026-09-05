// en-GB: Resolves strict wall-clock inputs without process-timezone coercion or DST ambiguity.
import { Temporal } from "@js-temporal/polyfill";
import { z } from "zod";
import { badRequest } from "../errors/app-error.js";
import { loadCompanyTimezone, parseRfc3339Instant } from "./date-range.service.js";

const localDatetimePattern =
  /^(\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])[Tt](?:[01]\d|2[0-3]):[0-5]\d)(?::([0-5]\d)(?:\.(\d+))?)?$/;

function parseLocalDatetime(value: string) {
  const match = localDatetimePattern.exec(value);
  if (!match || match[0] !== value) throw new RangeError("Invalid local datetime");
  const [, minute, second, fraction] = match;
  const normalised = `${minute}:${second ?? "00"}${fraction ? `.${fraction.slice(0, 9)}` : ""}`;
  return Temporal.PlainDateTime.from(normalised);
}

function parseDatetime(value: unknown) {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return { instant: new Date(value.getTime()) };
  }
  if (typeof value !== "string") throw badRequest("Expected a valid datetime string");
  try {
    return { instant: new Date(parseRfc3339Instant(value).epochMilliseconds) };
  } catch {
    try {
      return { local: parseLocalDatetime(value) };
    } catch {
      throw badRequest("Expected a real local datetime or RFC3339 instant");
    }
  }
}

export const bodyDatetimeSchema = z.string().refine((value) => {
  try {
    parseDatetime(value);
    return true;
  } catch {
    return false;
  }
}, "Expected a real local datetime or RFC3339 instant");

export const timezoneSchema = z
  .string()
  .min(3)
  .max(64)
  .refine((value) => {
    if (/^[+-]/.test(value) || value !== value.trim()) return false;
    try {
      new Intl.DateTimeFormat("en-GB", { timeZone: value }).format(0);
      return true;
    } catch {
      return false;
    }
  }, "Expected a valid IANA timezone");

export function resolveZonedDatetime(value: unknown, timezone: string): Date {
  const parsed = parseDatetime(value);
  if (parsed.instant) return parsed.instant;
  try {
    if (!timezoneSchema.safeParse(timezone).success) throw new RangeError("Invalid timezone");
    // Reject both missing and repeated wall times; neither has one unambiguous instant.
    return new Date(
      parsed.local.toZonedDateTime(timezone, { disambiguation: "reject" }).epochMilliseconds
    );
  } catch {
    throw badRequest("Datetime cannot be resolved unambiguously in the selected timezone");
  }
}

export async function resolveCompanyDatetime(companyId: string, value: unknown): Promise<Date> {
  const parsed = parseDatetime(value);
  if (parsed.instant) return parsed.instant;
  return resolveZonedDatetime(value, await loadCompanyTimezone(companyId));
}
