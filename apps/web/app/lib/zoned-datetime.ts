// en-GB: Keeps editable wall times explicit and preserves unchanged persisted instants.
import { Temporal } from "@js-temporal/polyfill";

export function isNamedTimezone(timezone?: string): timezone is string {
  if (!timezone || timezone !== timezone.trim() || /^[+-]/.test(timezone)) return false;
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: timezone }).format(0);
    return true;
  } catch {
    return false;
  }
}

export function zonedDateInputValue(value: string | Date | null | undefined, timezone?: string) {
  if (!value || !isNamedTimezone(timezone)) return "";
  try {
    const instant = Temporal.Instant.from(value instanceof Date ? value.toISOString() : value);
    return instant
      .toZonedDateTimeISO(timezone)
      .toPlainDateTime()
      .toString({ smallestUnit: "minute" });
  } catch {
    return "";
  }
}

export function datetimeFieldPayload(
  form: FormData,
  name: string,
  original?: string | null,
  originalTimezone?: string
) {
  if (!form.has(name)) return undefined;
  const value = String(form.get(name) ?? "");
  if (!value) return null;
  const displayed = zonedDateInputValue(original, originalTimezone);
  if (displayed && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?$/.test(value)) {
    try {
      // Omitting an unchanged field preserves precision, fold identity and concurrent updates.
      if (Temporal.PlainDateTime.from(value).equals(Temporal.PlainDateTime.from(displayed))) {
        return undefined;
      }
    } catch {
      // New input remains untrusted; the API owns validation and timezone resolution.
    }
  }
  return value;
}

export function zonedDatetimeInstant(value: string, timezone?: string) {
  const match =
    /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,9})?)?$/.exec(
      value
    );
  if (!isNamedTimezone(timezone) || !match || match[0] !== value) {
    throw new RangeError("Expected a local datetime and an explicit named timezone");
  }
  // New coverage intent must never silently choose either side of a gap or fold.
  const civil = Temporal.PlainDateTime.from(value, { overflow: "reject" });
  const zoned = civil.toZonedDateTime(timezone, { disambiguation: "reject" });
  return new Date(zoned.epochMilliseconds).toISOString();
}
