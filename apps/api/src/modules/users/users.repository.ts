import { BaseRepository } from "../../shared/repositories/base.repository.js";

export class UsersRepository extends BaseRepository {
  constructor() {
    super("user");
  }
}
