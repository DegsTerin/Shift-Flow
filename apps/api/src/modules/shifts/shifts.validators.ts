// en-GB: Validates shifts input so malformed data cannot cross the module boundary.
import { z } from "zod";
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

export const shiftCreateSchema = shiftContentSchema.extend({
  status: z.enum(["PLANNED", "OPEN", "CLOSED", "REOPENED", "CANCELLED"]).optional()
});

// Keep the established create-schema export for existing internal consumers.
export const shiftSchema = shiftCreateSchema;

export const shiftUpdateSchema = shiftContentSchema
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, "At least one shift field is required");

export const coverageSchema = z.object({
  userId: z.string().uuid(),
  replacementForUserId: z.string().uuid().optional(),
  type: z.enum(["REGULAR", "ON_CALL", "VACATION", "SUBSTITUTE", "ABSENCE"]).default("REGULAR"),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
  note: z.string().max(5000).optional()
});
