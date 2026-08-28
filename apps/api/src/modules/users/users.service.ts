// en-GB: Implements users rules so invariants remain centralised outside the transport layer.
import bcrypt from "bcryptjs";
import type { ApiRequest } from "../../shared/http/request-types.js";
import { getDelegate } from "../../shared/lib/prisma.js";
import { toBoundedSearch, toPagination, toSkipTake } from "../../shared/http/pagination.js";
import { badRequest, forbidden, notFound } from "../../shared/errors/app-error.js";
import { BaseService } from "../../shared/services/base.service.js";
import { buildAuditData } from "../../shared/services/audit-writer.js";
import { validatePasswordPolicy } from "../../shared/security/password-policy.js";
import { UsersRepository } from "./users.repository.js";

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
  findMany(args: unknown): Promise<
    Array<{
      role?: {
        permissions?: Array<{
          permission?: { resource?: string; action?: string };
        }>;
      };
    }>
  >;
};

export class UsersService extends BaseService {
  constructor(private readonly usersRepository = new UsersRepository()) {
    super(usersRepository, "User", {
      hasCompanyScope: false,
      userStamps: false,
      auditWrites: false,
      orderBy: { updatedAt: "desc" }
    });
  }

  override async list(req: ApiRequest) {
    const companyId = this.requireCurrentCompanyId(req);
    const pagination = toPagination(req.query);
    const search = toBoundedSearch(req.query);
    const where = {
      deletedAt: null,
      companies: { some: { companyId, deletedAt: null } },
      ...(search
        ? {
            OR: ["email", "displayName", "jobTitle"].map((field) => ({
              [field]: { contains: search, mode: "insensitive" }
            }))
          }
        : {})
    };
    const [items, total] = await Promise.all([
      this.repository.list({
        where,
        ...toSkipTake(pagination),
        orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
        include: {
          roleAssignments: {
            where: {
              companyId,
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
    const companyId = this.requireCurrentCompanyId(req);
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
    return this.usersRepository.createAggregate(
      {
        ...rest,
        passwordHash: await bcrypt.hash(password, 12)
      },
      companyId,
      roleSelection.role.id,
      (_before, after) =>
        buildAuditData(req, {
          entityType: "User",
          entityId: String((after as { id?: string }).id ?? "unknown"),
          action: "CREATE",
          after,
          companyId
        })
    );
  }

  override async get(req: ApiRequest, id: string) {
    const item = await this.findInCurrentCompany(req, id);
    if (!item) {
      throw notFound("User not found");
    }
    return item;
  }

  override async update(req: ApiRequest, id: string, data: Record<string, unknown>) {
    const companyId = this.requireCurrentCompanyId(req);
    const before = await this.get(req, id);
    const roleId = data.roleId ? String(data.roleId) : undefined;
    const roleSelection = roleId ? await this.resolveProductRole(req, roleId) : undefined;
    if (roleSelection) {
      await this.assertCanAssignRole(req, roleSelection);
    }
    const { roleId: _roleId, password, ...globalChanges } = data;
    void _roleId;
    const hasPasswordChange = typeof password === "string" && password.length > 0;
    const hasGlobalChanges = hasPasswordChange || Object.keys(globalChanges).length > 0;
    let aggregateData: Record<string, unknown> | undefined;
    if (hasPasswordChange) {
      validatePasswordPolicy(String(password));
      aggregateData = {
        ...globalChanges,
        passwordHash: await bcrypt.hash(String(password), 12)
      };
    } else if (hasGlobalChanges) {
      aggregateData = globalChanges;
    }
    if (!hasGlobalChanges && !roleSelection) return before;
    return this.usersRepository.updateAggregate(
      id,
      companyId,
      {
        ...(aggregateData ? { data: aggregateData } : {}),
        ...(roleSelection ? { roleId: roleSelection.role.id } : {}),
        ...(hasPasswordChange ? { credentialChange: true, revokeSessions: true } : {})
      },
      (transactionBefore, after) =>
        buildAuditData(req, {
          entityType: "User",
          entityId: id,
          action: "UPDATE",
          before: transactionBefore,
          after,
          companyId
        })
    );
  }

  override async remove(req: ApiRequest, id: string) {
    const companyId = this.requireCurrentCompanyId(req);
    const before = await this.get(req, id);
    return this.usersRepository.updateAggregate(
      id,
      companyId,
      { data: { deletedAt: new Date() }, revokeSessions: true },
      (transactionBefore, after) =>
        buildAuditData(req, {
          entityType: "User",
          entityId: id,
          action: "SOFT_DELETE",
          before: transactionBefore ?? before,
          after,
          companyId
        })
    );
  }

  private async findInCurrentCompany(req: ApiRequest, id: string) {
    const companyId = this.requireCurrentCompanyId(req);
    const users = await getDelegate<UserDelegate>("user");
    return users.findFirst({
      where: {
        id,
        deletedAt: null,
        companies: { some: { companyId, deletedAt: null } }
      },
      include: {
        roleAssignments: {
          where: {
            companyId,
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
    const companyId = this.requireCurrentCompanyId(req);

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

  private requireCurrentCompanyId(req: ApiRequest) {
    const companyId = this.companyId(req);
    if (!companyId) {
      throw badRequest("Company context is required");
    }
    return companyId;
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
