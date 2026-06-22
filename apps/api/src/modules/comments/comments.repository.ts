import { BaseRepository } from "../../shared/repositories/base.repository.js";

export class CommentsRepository extends BaseRepository {
  constructor() {
    super("comment");
  }
}
