// en-GB: Validates shifts input so malformed data cannot cross the module boundary.
import { z } from "zod";
import { parseRfc3339Instant } from "../../shared/services/date-range.service.js";
import {
  bodyDatetimeSchema,
  timezoneSchema
} from "../../shared/services/zoned-datetime.service.js";

const shiftContentSchema = z.object({
  name: z.string().min(2).max(160),
  startsAt: bodyDatetimeSchema,
  endsAt: bodyDatetimeSchema,
  timezone: timezoneSchema.optional()
});

export const shiftCreateSchema = shiftContentSchema
  .extend({ status: z.enum(["PLANNED", "OPEN"]).optional() })
  .strict();

// Keep the established create-schema export for existing internal consumers.
export const shiftSchema = shiftCreateSchema;

export const shiftUpdateSchema = shiftContentSchema
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, "At least one shift field is required");

const coverageInstantSchema = z.string().refine((value) => {
  try {
    parseRfc3339Instant(value);
    return true;
  } catch {
    return false;
  }
}, "Expected a real RFC3339 datetime with an explicit offset");

export const coverageSchema = z.object({
  userId: z.string().uuid(),
  replacementForUserId: z.string().uuid().optional(),
  type: z.enum(["REGULAR", "ON_CALL", "VACATION", "SUBSTITUTE", "ABSENCE"]).default("REGULAR"),
  startsAt: coverageInstantSchema,
  endsAt: coverageInstantSchema,
  note: z.string().max(5000).optional()
});
