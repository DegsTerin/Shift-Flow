// en-GB: Implements users rules so invariants remain centralised outside the transport layer.
import bcrypt from "bcryptjs";
import type { ApiRequest } from "../../shared/http/request-types.js";
import { getDelegate } from "../../shared/lib/prisma.js";
import { toPagination, toSkipTake } from "../../shared/http/pagination.js";
import { badRequest, forbidden, notFound } from "../../shared/errors/app-error.js";
import { BaseService } from "../../shared/services/base.service.js";
import { validatePasswordPolicy } from "../../shared/security/password-policy.js";
import { UsersRepository } from "./users.repository.js";

type UserCompanyDelegate = {
  upsert(args: unknown): Promise<unknown>;
};

type UserDelegate = {
  findFirst(args: unknown): Promise<unknown | null>;
};

type RoleDelegate = {
  findFirst(args: unknown): Promise<{
    id: string;
    name?: string;
    scope?: string;
    isActive?: boolean;
    permissions?: Array<{
      permission?: {
        resource?: string;
        action?: string;
      };
    }>;
  } | null>;
};

type ProductRoleSelection = {
  companyId: string;
  role: NonNullable<Awaited<ReturnType<RoleDelegate["findFirst"]>>>;
};

type UserRoleAssignmentDelegate = {
  findFirst(args: unknown): Promise<{ id: string } | null>;
  findMany(args: unknown): Promise<
    Array<{
      role?: {
        permissions?: Array<{
          permission?: { resource?: string; action?: string };
        }>;
      };
    }>
  >;
  create(args: unknown): Promise<unknown>;
  update(args: unknown): Promise<unknown>;
  updateMany(args: unknown): Promise<unknown>;
};

export class UsersService extends BaseService {
  constructor() {
    super(new UsersRepository(), "User", {
      hasCompanyScope: false,
      userStamps: false,
      orderBy: { updatedAt: "desc" }
    });
  }

  override async list(req: ApiRequest) {
    const companyId = this.companyId(req);
    const pagination = toPagination(req.query);
    const where = {
      deletedAt: null,
      ...(companyId ? { companies: { some: { companyId, deletedAt: null } } } : {})
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
              startsAt: { lte: new Date() },
              OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }]
            },
            include: { role: true }
          }
        }
      }),
      this.repository.count(where)
    ]);

    return { items, total, ...pagination };
  }

  override async create(req: ApiRequest, data: Record<string, unknown>) {
    const password = String(data.password);
    validatePasswordPolicy(password);
    const rest = { ...data };
    const roleId = rest.roleId ? String(rest.roleId) : undefined;
    if (!roleId) {
      throw badRequest("roleId is required when creating a user");
    }
    const roleSelection = await this.resolveProductRole(req, roleId);
    await this.assertCanAssignRole(req, roleSelection);
    delete rest.password;
    delete rest.roleId;
    const created = await super.create(req, {
      ...rest,
      passwordHash: await bcrypt.hash(password, 12)
    });
    await this.attachToCurrentCompany(req, String((created as { id: string }).id), roleSelection);
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
    const roleSelection = roleId ? await this.resolveProductRole(req, roleId) : undefined;
    if (roleSelection) {
      await this.assertCanAssignRole(req, roleSelection);
    }
    delete data.roleId;
    let updated: unknown;
    if (data.password) {
      const { password, ...rest } = data;
      validatePasswordPolicy(String(password));
      updated = await super.update(req, id, {
        ...rest,
        passwordHash: await bcrypt.hash(String(password), 12),
        passwordChangedAt: new Date()
      });
    } else {
      updated = await super.update(req, id, data);
    }

    if (roleSelection) {
      await this.attachToCurrentCompany(req, id, roleSelection);
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
        ...(companyId ? { companies: { some: { companyId, deletedAt: null } } } : {})
      },
      include: {
        roleAssignments: {
          where: {
            ...(companyId ? { companyId } : {}),
            deletedAt: null,
            startsAt: { lte: new Date() },
            OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }]
          },
          include: { role: true }
        }
      }
    });
  }

  private async resolveProductRole(
    req: ApiRequest,
    requestedRoleId: string
  ): Promise<ProductRoleSelection> {
    const companyId = this.companyId(req);
    if (!companyId) {
      throw badRequest("Company context is required");
    }

    const roles = await getDelegate<RoleDelegate>("role");
    const requestedRole = await roles.findFirst({
      where: {
        id: requestedRoleId,
        companyId,
        scope: "COMPANY",
        isActive: true,
        deletedAt: null
      },
      include: {
        permissions: {
          where: {
            OR: [{ companyId }, { companyId: null }],
            permission: {
              deletedAt: null,
              OR: [{ companyId }, { companyId: null }]
            }
          },
          include: { permission: true }
        }
      }
    });
    if (!requestedRole || requestedRole.scope !== "COMPANY" || requestedRole.isActive !== true) {
      throw badRequest("The user editor accepts active company-scoped profiles only");
    }
    return { companyId, role: requestedRole };
  }

  private async attachToCurrentCompany(
    req: ApiRequest,
    userId: string,
    selection: ProductRoleSelection
  ) {
    const { companyId, role } = selection;

    const userCompany = await getDelegate<UserCompanyDelegate>("userCompany");
    await userCompany.upsert({
      where: { companyId_userId: { companyId, userId } },
      create: { companyId, userId, isDefault: true },
      update: { deletedAt: null }
    });

    const assignments = await getDelegate<UserRoleAssignmentDelegate>("userRoleAssignment");
    const now = new Date();
    await assignments.updateMany({
      where: {
        companyId,
        userId,
        deletedAt: null,
        clientId: null,
        teamId: null,
        startsAt: { lte: now },
        endsAt: null,
        NOT: { roleId: role.id },
        role: { scope: "COMPANY" }
      },
      data: { deletedAt: new Date() }
    });
    const existingAssignment = await assignments.findFirst({
      where: {
        companyId,
        userId,
        roleId: role.id,
        clientId: null,
        teamId: null,
        deletedAt: null,
        startsAt: { lte: now },
        endsAt: null
      }
    });
    if (existingAssignment) {
      return;
    }

    await assignments.create({ data: { companyId, userId, roleId: role.id } });
  }

  private async assertCanAssignRole(req: ApiRequest, selection: ProductRoleSelection) {
    const actorUserId = req.auth?.id;
    if (!actorUserId) {
      throw forbidden("Authenticated role delegation is required");
    }
    const { companyId, role } = selection;
    const assignments = await getDelegate<UserRoleAssignmentDelegate>("userRoleAssignment");
    const now = new Date();
    const actorAssignments = await assignments.findMany({
      where: {
        companyId,
        userId: actorUserId,
        deletedAt: null,
        clientId: null,
        teamId: null,
        startsAt: { lte: now },
        OR: [{ endsAt: null }, { endsAt: { gt: now } }],
        company: { status: "ACTIVE", deletedAt: null },
        user: {
          status: "ACTIVE",
          deletedAt: null,
          companies: {
            some: {
              companyId,
              deletedAt: null,
              company: { status: "ACTIVE", deletedAt: null }
            }
          }
        },
        role: {
          scope: "COMPANY",
          isActive: true,
          deletedAt: null,
          OR: [{ companyId }, { companyId: null }]
        }
      },
      include: {
        role: {
          include: {
            permissions: {
              where: {
                OR: [{ companyId }, { companyId: null }],
                permission: {
                  deletedAt: null,
                  OR: [{ companyId }, { companyId: null }]
                }
              },
              include: { permission: true }
            }
          }
        }
      }
    });
    const actorPermissions = new Set(
      actorAssignments.flatMap(
        (assignment) =>
          assignment.role?.permissions?.map(
            (item) => `${item.permission?.resource}:${item.permission?.action}`
          ) ?? []
      )
    );
    const isSuperAdmin = actorPermissions.has("*:*");
    if (!isSuperAdmin && !actorPermissions.has("users:write")) {
      throw forbidden("Current company-wide users:write authority is required");
    }
    const targetPermissions =
      role.permissions?.map((item) => `${item.permission?.resource}:${item.permission?.action}`) ??
      [];
    if (
      !isSuperAdmin &&
      targetPermissions.some((permission) => !actorPermissions.has(permission))
    ) {
      throw forbidden("A profile cannot be delegated beyond the actor's current permissions");
    }
  }
}
