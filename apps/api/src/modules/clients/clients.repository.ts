import { BaseRepository } from "../../shared/repositories/base.repository.js";

export class ClientsRepository extends BaseRepository {
  constructor() {
    super("client");
  }
}
