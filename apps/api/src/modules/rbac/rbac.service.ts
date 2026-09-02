// en-GB: Implements rbac rules so invariants remain centralised outside the transport layer.
import type {
  ApiRequest,
  AuthenticatedUser,
  TenantContext
} from "../../shared/http/request-types.js";
import { toBoundedSearch, toPagination, toSkipTake } from "../../shared/http/pagination.js";
import { badRequest, forbidden, notFound } from "../../shared/errors/app-error.js";
import { BaseService } from "../../shared/services/base.service.js";
import { buildAuditData } from "../../shared/services/audit-writer.js";
import type { PrismaTransactionClient } from "../../shared/lib/prisma.js";
import { RbacRepository } from "./rbac.repository.js";

type PermissionRule = {
  resource: string;
  action: string;
  tenant?: TenantContext;
};

type Assignment = {
  companyId: string;
  clientId?: string | null;
  teamId?: string | null;
  role?: {
    companyId?: string | null;
    scope?: string;
    isActive?: boolean;
    permissions?: Array<{
      permission?: {
        companyId?: string | null;
        resource?: string;
        action?: string;
      };
    }>;
  };
};

const superAdminPermission = "*:*";
const mutableRoleFields = ["name", "description", "color", "scope", "isActive"] as const;
const mutablePermissionFields = ["resource", "action", "description"] as const;

function pickAllowedFields(data: Record<string, unknown>, fields: readonly string[]) {
  return Object.fromEntries(
    fields
      .filter((field) => Object.prototype.hasOwnProperty.call(data, field))
      .map((field) => [field, data[field]])
  );
}

function roleInclude(now = new Date()) {
  return {
    permissions: {
      include: { permission: true },
      orderBy: { createdAt: "asc" }
    },
    _count: {
      select: {
        assignments: {
          where: {
            deletedAt: null,
            startsAt: { lte: now },
            OR: [{ endsAt: null }, { endsAt: { gt: now } }]
          }
        }
      }
    }
  };
}

export function assignmentGrantsPermission(
  assignment: Assignment,
  rule: PermissionRule,
  companyId: string
) {
  if (assignment.companyId !== companyId || !assignment.role) {
    return false;
  }
  if (assignment.role.companyId && assignment.role.companyId !== companyId) {
    return false;
  }

  const clientScopeMatches = assignment.clientId
    ? assignment.clientId === rule.tenant?.clientId
    : assignment.role.scope !== "CLIENT";
  const teamScopeMatches = assignment.teamId
    ? assignment.teamId === rule.tenant?.teamId
    : assignment.role.scope !== "TEAM";
  if (!clientScopeMatches || !teamScopeMatches || assignment.role.isActive === false) {
    return false;
  }

  const required = `${rule.resource}:${rule.action}`;
  const permissions =
    assignment.role.permissions
      ?.filter((item) => !item.permission?.companyId || item.permission.companyId === companyId)
      .map((item) => `${item.permission?.resource}:${item.permission?.action}`) ?? [];
  return permissions.includes(required) || permissions.includes(superAdminPermission);
}

class RolesService extends BaseService {
  constructor(private readonly rbacRepository: RbacRepository) {
    super(rbacRepository.roles, "Role", { userStamps: false });
  }

  override async create(req: ApiRequest, data: Record<string, unknown>) {
    return super.create(req, pickAllowedFields(data, mutableRoleFields));
  }

  override async list(req: ApiRequest, filters: Record<string, unknown> = {}) {
    const pagination = toPagination(req.query);
    const companyId = this.requireCompanyId(req);
    const search = toBoundedSearch(req.query);
    const where = {
      ...filters,
      companyId,
      deletedAt: null,
      ...(search
        ? {
            OR: ["name", "description"].map((field) => ({
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
        include: roleInclude()
      }),
      this.repository.count(where)
    ]);

    return { items, total, ...pagination };
  }

  override async get(req: ApiRequest, id: string) {
    const item = await this.repository.findById(id, this.requireCompanyId(req), roleInclude());
    if (!item) {
      throw notFound("Role not found");
    }
    return item;
  }

  override async remove(req: ApiRequest, id: string) {
    const companyId = this.requireCompanyId(req);
    if (!companyId) {
      throw badRequest("Company context is required");
    }
    return this.rbacRepository.mutateRole(
      id,
      companyId,
      { deletedAt: new Date() },
      "SOFT_DELETE",
      (before, after) =>
        buildAuditData(req, {
          entityType: "Role",
          entityId: id,
          action: "SOFT_DELETE",
          before,
          after,
          companyId
        })
    );
  }

  override async update(req: ApiRequest, id: string, data: Record<string, unknown>) {
    const companyId = this.requireCompanyId(req);
    if (!companyId) {
      throw badRequest("Company context is required");
    }
    return this.rbacRepository.mutateRole(
      id,
      companyId,
      pickAllowedFields(data, mutableRoleFields),
      "UPDATE",
      (before, after) =>
        buildAuditData(req, {
          entityType: "Role",
          entityId: id,
          action: "UPDATE",
          before,
          after,
          companyId
        })
    );
  }

  async duplicate(req: ApiRequest, id: string) {
    const companyId = this.requireCompanyId(req);
    if (!companyId) {
      throw badRequest("Company context is required");
    }
    const role = await this.rbacRepository.findRole(id, companyId);
    if (!role) {
      throw notFound("Role not found");
    }
    if (role.isSystem) {
      throw badRequest("System profiles cannot be duplicated");
    }
    return this.rbacRepository.duplicateRole(id, companyId, `${role.name ?? "Perfil"} - copia`);
  }
}

class PermissionsService extends BaseService {
  constructor(repository: RbacRepository) {
    super(repository.permissions, "Permission", {
      userStamps: false,
      orderBy: [{ resource: "asc" }, { action: "asc" }, { id: "asc" }]
    });
  }

  override async create(req: ApiRequest, data: Record<string, unknown>) {
    return super.create(req, pickAllowedFields(data, mutablePermissionFields));
  }
}

export class RbacService {
  private static repository = new RbacRepository();
  static roles = new RolesService(RbacService.repository);
  static permissions = new PermissionsService(RbacService.repository);

  static async hasPermission(
    user: AuthenticatedUser,
    rule: PermissionRule,
    transaction?: PrismaTransactionClient
  ) {
    const requiredPermission = `${rule.resource}:${rule.action}`;
    if (
      user.sessionKind === "portfolio" &&
      !user.permissions?.includes(requiredPermission) &&
      !user.permissions?.includes(superAdminPermission)
    ) {
      return false;
    }

    if (rule.tenant?.companyId && rule.tenant.companyId !== user.companyId) {
      return false;
    }
    const companyId = rule.tenant?.companyId ?? user.companyId;
    if (!companyId) {
      return false;
    }

    const assignments = (await RbacService.repository.findAssignmentsForUser(
      user.id,
      companyId,
      transaction
    )) as Assignment[];

    return assignments.some((assignment) =>
      assignmentGrantsPermission(assignment, rule, companyId)
    );
  }

  private static effectiveCompany(user: AuthenticatedUser | undefined, tenant?: TenantContext) {
    const tenantCompanyId = tenant?.companyId;
    const userCompanyId = user?.companyId;

    if (tenantCompanyId && userCompanyId && tenantCompanyId !== userCompanyId) {
      throw forbidden("Invalid company context");
    }

    const companyId = tenantCompanyId ?? userCompanyId;
    if (!companyId) {
      throw badRequest("Company context is required");
    }
    return companyId;
  }

  static async assignRole(
    actor: AuthenticatedUser | undefined,
    tenant: TenantContext | undefined,
    data: Record<string, unknown>
  ) {
    const companyId = RbacService.effectiveCompany(actor, tenant);

    const role = await RbacService.repository.findRole(String(data.roleId), companyId);
    if (!role || role.isActive !== true) {
      throw badRequest("Role is not active in the current company");
    }

    const userCompany = await RbacService.repository.findUserCompany(
      String(data.userId),
      companyId
    );
    if (!userCompany) {
      throw badRequest("User is not linked to the active company");
    }

    const clientId = data.clientId ? String(data.clientId) : undefined;
    const teamId = data.teamId ? String(data.teamId) : undefined;
    if (role.scope === "CLIENT" && !clientId) {
      throw badRequest("Client-scoped roles require a client");
    }
    if (role.scope === "TEAM" && !teamId) {
      throw badRequest("Team-scoped roles require a team");
    }

    const [client, team] = await Promise.all([
      clientId ? RbacService.repository.findClient(clientId, companyId) : undefined,
      teamId ? RbacService.repository.findTeam(teamId, companyId) : undefined
    ]);
    if (clientId && !client) {
      throw badRequest("Client does not belong to the active company");
    }
    if (teamId && !team) {
      throw badRequest("Team does not belong to the active company");
    }

    const startsAt = data.startsAt instanceof Date ? data.startsAt : new Date();
    const endsAt = data.endsAt instanceof Date ? data.endsAt : undefined;
    if (endsAt && endsAt <= startsAt) {
      throw badRequest("endsAt must be later than startsAt");
    }

    return RbacService.repository.assignRole({
      companyId,
      userId: String(data.userId),
      roleId: String(data.roleId),
      ...(clientId ? { clientId } : {}),
      ...(teamId ? { teamId } : {}),
      ...(data.startsAt instanceof Date ? { startsAt } : {}),
      ...(endsAt ? { endsAt } : {})
    });
  }

  static async assignPermission(
    actor: AuthenticatedUser | undefined,
    tenant: TenantContext | undefined,
    roleId: string,
    permissionId: string
  ) {
    const companyId = RbacService.effectiveCompany(actor, tenant);

    const [role, permission] = await Promise.all([
      RbacService.repository.findRole(roleId, companyId),
      RbacService.repository.findPermission(permissionId, companyId)
    ]);
    if (!role) {
      throw badRequest("Role does not belong to the active company");
    }
    if (role.isSystem) {
      throw badRequest("System profile permissions cannot be changed");
    }
    if (!permission) {
      throw badRequest("Permission is not available in the active company");
    }

    return RbacService.repository.assignPermission(roleId, permissionId, companyId);
  }

  static async removePermission(
    actor: AuthenticatedUser | undefined,
    tenant: TenantContext | undefined,
    roleId: string,
    permissionId: string
  ) {
    const companyId = RbacService.effectiveCompany(actor, tenant);
    const role = await RbacService.repository.findRole(roleId, companyId);
    if (!role) {
      throw badRequest("Role does not belong to the active company");
    }
    if (role.isSystem) {
      throw badRequest("System profile permissions cannot be changed");
    }
    return RbacService.repository.removePermission(roleId, permissionId, companyId);
  }
}
