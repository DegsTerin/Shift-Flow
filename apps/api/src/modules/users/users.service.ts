import bcrypt from "bcryptjs";
import type { ApiRequest } from "../../shared/http/request-types.js";
import { getDelegate } from "../../shared/lib/prisma.js";
import { toPagination, toSkipTake } from "../../shared/http/pagination.js";
import { forbidden, notFound } from "../../shared/errors/app-error.js";
import { BaseService } from "../../shared/services/base.service.js";
import { UsersRepository } from "./users.repository.js";

type UserCompanyDelegate = {
  upsert(args: unknown): Promise<unknown>;
};

type UserDelegate = {
  findFirst(args: unknown): Promise<unknown | null>;
};

type RoleDelegate = {
  findFirst(args: unknown): Promise<{ id: string; name?: string } | null>;
};

type UserRoleAssignmentDelegate = {
  findFirst(args: unknown): Promise<{ id: string } | null>;
  findMany(args: unknown): Promise<Array<{ role?: { name?: string } }>>;
  create(args: unknown): Promise<unknown>;
  update(args: unknown): Promise<unknown>;
  updateMany(args: unknown): Promise<unknown>;
};

const roleRanks: Record<string, number> = {
  Visualizador: 10,
  Operador: 20,
  Supervisor: 30,
  Gestor: 40,
  Administrador: 50,
  "Integration Admin": 50,
};

export class UsersService extends BaseService {
  constructor() {
    super(new UsersRepository(), "User", {
      hasCompanyScope: false,
      userStamps: false,
      orderBy: { updatedAt: "desc" },
    });
  }

  override async list(req: ApiRequest) {
    const companyId = this.companyId(req);
    const pagination = toPagination(req.query);
    const where = {
      deletedAt: null,
      ...(companyId
        ? { companies: { some: { companyId, deletedAt: null } } }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.repository.list({
        where,
        ...toSkipTake(pagination),
        orderBy: { updatedAt: "desc" },
        include: {
          roleAssignments: {
            where: {
              ...(companyId ? { companyId } : {}),
              deletedAt: null,
              OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }],
            },
            include: { role: true },
          },
        },
      }),
      this.repository.count(where),
    ]);

    return { items, total, ...pagination };
  }

  override async create(req: ApiRequest, data: Record<string, unknown>) {
    const password = String(data.password);
    const rest = { ...data };
    const roleId = rest.roleId ? String(rest.roleId) : undefined;
    delete rest.password;
    delete rest.roleId;
    const created = await super.create(req, {
      ...rest,
      passwordHash: await bcrypt.hash(password, 12),
    });
    await this.attachToCurrentCompany(req, String((created as { id: string }).id), roleId);
    return created;
  }

  override async get(req: ApiRequest, id: string) {
    const item = await this.findInCurrentCompany(req, id);
    if (!item) {
      throw notFound("User not found");
    }
    return item;
  }

  override async update(req: ApiRequest, id: string, data: Record<string, unknown>) {
    await this.get(req, id);
    const roleId = data.roleId ? String(data.roleId) : undefined;
    delete data.roleId;
    let updated: unknown;
    if (data.password) {
      const { password, ...rest } = data;
      updated = await super.update(req, id, {
        ...rest,
        passwordHash: await bcrypt.hash(String(password), 12),
        passwordChangedAt: new Date(),
      });
    } else {
      updated = await super.update(req, id, data);
    }

    if (roleId) {
      await this.attachToCurrentCompany(req, id, roleId);
    }
    return updated;
  }

  override async remove(req: ApiRequest, id: string) {
    await this.get(req, id);
    return super.remove(req, id);
  }

  private async findInCurrentCompany(req: ApiRequest, id: string) {
    const companyId = this.companyId(req);
    const users = await getDelegate<UserDelegate>("user");
    return users.findFirst({
      where: {
        id,
        deletedAt: null,
        ...(companyId
          ? { companies: { some: { companyId, deletedAt: null } } }
          : {}),
      },
      include: {
        roleAssignments: {
          where: {
            ...(companyId ? { companyId } : {}),
            deletedAt: null,
            OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }],
          },
          include: { role: true },
        },
      },
    });
  }

  private async attachToCurrentCompany(req: ApiRequest, userId: string, requestedRoleId?: string) {
    const companyId = this.companyId(req);
    if (!companyId) return;

    const userCompany = await getDelegate<UserCompanyDelegate>("userCompany");
    await userCompany.upsert({
      where: { companyId_userId: { companyId, userId } },
      create: { companyId, userId, isDefault: true },
      update: { deletedAt: null },
    });

    const roles = await getDelegate<RoleDelegate>("role");
    const role =
      (requestedRoleId
        ? await roles.findFirst({ where: { id: requestedRoleId, companyId, deletedAt: null } })
        : null) ??
      (await (await getDelegate<RoleDelegate>("role")).findFirst({
        where: {
          companyId,
          deletedAt: null,
          name: "Operador",
        },
        orderBy: { createdAt: "asc" },
      })) ??
      (await (await getDelegate<RoleDelegate>("role")).findFirst({
        where: {
          companyId,
          deletedAt: null,
        },
        orderBy: { createdAt: "asc" },
      }));
    if (!role) return;

    const assignments = await getDelegate<UserRoleAssignmentDelegate>("userRoleAssignment");
    await this.assertCanAssignRole(assignments, req.auth?.id, companyId, role.name);
    await assignments.updateMany({
      where: { companyId, userId, deletedAt: null, NOT: { roleId: role.id } },
      data: { deletedAt: new Date() },
    });
    const existingAssignment = await assignments.findFirst({
      where: { companyId, userId, roleId: role.id },
    });
    if (existingAssignment) {
      await assignments.update({
        where: { id: existingAssignment.id },
        data: { deletedAt: null, endsAt: null },
      });
      return;
    }

    await assignments.create({ data: { companyId, userId, roleId: role.id } });
  }

  private async assertCanAssignRole(
    assignments: UserRoleAssignmentDelegate,
    actorUserId: string | undefined,
    companyId: string,
    targetRoleName?: string,
  ) {
    if (!actorUserId || !targetRoleName) return;
    const actorAssignments = await assignments.findMany({
      where: {
        companyId,
        userId: actorUserId,
        deletedAt: null,
        OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }],
      },
      include: { role: true },
    });
    const actorRank = Math.max(
      0,
      ...actorAssignments.map((assignment) => roleRanks[assignment.role?.name ?? ""] ?? 0),
    );
    const targetRank = roleRanks[targetRoleName] ?? 0;
    if (actorRank < roleRanks.Administrador && targetRank >= actorRank) {
      throw forbidden("Only higher hierarchy profiles can assign this profile");
    }
  }
}
