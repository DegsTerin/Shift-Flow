// en-GB: Encapsulates clients persistence so data access remains consistent and testable.
import { BaseRepository } from "../../shared/repositories/base.repository.js";

export class ClientsRepository extends BaseRepository {
  constructor() {
    super("client");
  }
}
