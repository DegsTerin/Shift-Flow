import { BaseRepository } from "../../shared/repositories/base.repository.js";

export class AuditRepository extends BaseRepository {
  constructor() {
    super("auditLog");
  }
}
