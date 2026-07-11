// en-GB: Implements audit rules so invariants remain centralised outside the transport layer.
import type { ApiRequest } from "../../shared/http/request-types.js";
import { BaseService } from "../../shared/services/base.service.js";
import { AuditRepository } from "./audit.repository.js";

export class AuditService extends BaseService {
  constructor() {
    super(new AuditRepository(), "AuditLog", {
      deletedAtFilter: false,
      userStamps: false,
      auditWrites: false,
      orderBy: { createdAt: "desc" }
    });
  }

  override async list(req: ApiRequest) {
    const query = req.query as Record<string, unknown>;
    return super.list(req, {
      ...(query.entityType ? { entityType: query.entityType } : {}),
      ...(query.entityId ? { entityId: query.entityId } : {}),
      ...(query.action ? { action: query.action } : {}),
      ...(query.actorUserId ? { actorUserId: query.actorUserId } : {})
    });
  }
}
