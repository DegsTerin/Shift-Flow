// en-GB: Implements clients rules so invariants remain centralised outside the transport layer.
import { BaseService } from "../../shared/services/base.service.js";
import { ClientsRepository } from "./clients.repository.js";

export class ClientsService extends BaseService {
  constructor() {
    super(new ClientsRepository(), "Client", { userStamps: true, orderBy: { name: "asc" } });
  }
}
