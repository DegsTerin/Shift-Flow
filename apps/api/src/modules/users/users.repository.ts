// en-GB: Encapsulates users persistence so data access remains consistent and testable.
import { BaseRepository } from "../../shared/repositories/base.repository.js";

export class UsersRepository extends BaseRepository {
  constructor() {
    super("user");
  }
}
