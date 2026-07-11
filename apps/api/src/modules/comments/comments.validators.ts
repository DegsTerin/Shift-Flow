// en-GB: Validates comments input so malformed data cannot cross the module boundary.
import { z } from "zod";

export const commentSchema = z.object({
  activityId: z.string().uuid(),
  body: z.string().min(1).max(10000)
});

export const updateCommentSchema = z.object({
  body: z.string().min(1).max(10000)
});
