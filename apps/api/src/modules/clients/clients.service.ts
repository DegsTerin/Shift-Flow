import { BaseService } from "../../shared/services/base.service.js";
import { ClientsRepository } from "./clients.repository.js";

export class ClientsService extends BaseService {
  constructor() {
    super(new ClientsRepository(), "Client", { userStamps: true, orderBy: { name: "asc" } });
  }
}
