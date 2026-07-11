// en-GB: Encapsulates comments persistence so data access remains consistent and testable.
import { BaseRepository } from "../../shared/repositories/base.repository.js";

export class CommentsRepository extends BaseRepository {
  constructor() {
    super("comment");
  }
}
