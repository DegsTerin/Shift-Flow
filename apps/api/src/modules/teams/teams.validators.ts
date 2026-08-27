// en-GB: Validates teams input so malformed data cannot cross the module boundary.
import { z } from "zod";

export const teamSchema = z.object({
  name: z.string().min(2).max(160),
  description: z.string().max(5000).optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  defaultSlaMinutes: z.number().int().positive().optional()
});

export const teamMemberSchema = z
  .object({
    userId: z.string().uuid(),
    role: z.enum(["LEADER", "MEMBER"]).default("MEMBER"),
    startsAt: z.coerce.date().optional(),
    endsAt: z.coerce.date().optional()
  })
  .superRefine((value, context) => {
    if (value.endsAt && !value.startsAt) {
      context.addIssue({
        code: "custom",
        path: ["startsAt"],
        message: "startsAt is required when endsAt is provided"
      });
      return;
    }
    if (value.startsAt && value.endsAt && value.endsAt <= value.startsAt) {
      context.addIssue({
        code: "custom",
        path: ["endsAt"],
        message: "endsAt must be later than startsAt"
      });
    }
  });
