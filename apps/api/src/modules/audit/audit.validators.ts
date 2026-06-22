import { z } from "zod";

export const auditFilterSchema = z.object({
  entityType: z.string().max(120).optional(),
  entityId: z.string().max(80).optional(),
  action: z.string().max(120).optional(),
  actorUserId: z.string().uuid().optional(),
});
