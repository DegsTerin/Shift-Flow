import bcrypt from "bcryptjs";
import type { ApiRequest } from "../../shared/http/request-types.js";
import { BaseService } from "../../shared/services/base.service.js";
import { UsersRepository } from "./users.repository.js";

export class UsersService extends BaseService {
  constructor() {
    super(new UsersRepository(), "User", {
      hasCompanyScope: false,
      userStamps: false,
      orderBy: { updatedAt: "desc" },
    });
  }

  override async create(req: ApiRequest, data: Record<string, unknown>) {
    const password = String(data.password);
    const rest = { ...data };
    delete rest.password;
    return super.create(req, {
      ...rest,
      passwordHash: await bcrypt.hash(password, 12),
    });
  }

  override async update(req: ApiRequest, id: string, data: Record<string, unknown>) {
    if (data.password) {
      const { password, ...rest } = data;
      return super.update(req, id, {
        ...rest,
        passwordHash: await bcrypt.hash(String(password), 12),
        passwordChangedAt: new Date(),
      });
    }

    return super.update(req, id, data);
  }
}
