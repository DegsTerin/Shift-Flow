// en-GB: Validates clients input so malformed data cannot cross the module boundary.
import { z } from "zod";

export const clientSchema = z.object({
  name: z.string().min(2).max(160),
  code: z.string().max(64).optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional()
});
