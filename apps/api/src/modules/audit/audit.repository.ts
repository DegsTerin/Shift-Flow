// en-GB: Encapsulates audit persistence so data access remains consistent and testable.
import { BaseRepository } from "../../shared/repositories/base.repository.js";

export class AuditRepository extends BaseRepository {
  constructor() {
    super("auditLog");
  }
}
