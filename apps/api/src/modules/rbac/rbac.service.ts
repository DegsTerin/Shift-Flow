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
import { RbacRepository, type RbacAuditEvent, type RbacCommandContext } from "./rbac.repository.js";

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

function canonicalUuid(value: string) {
  return value.toLowerCase();
}

function sameUuid(left: string | null | undefined, right: string | null | undefined) {
  return Boolean(left && right && canonicalUuid(left) === canonicalUuid(right));
}

function pickAllowedFields(data: Record<string, unknown>, fields: readonly string[]) {
  return Object.fromEntries(
    fields
      .filter((field) => Object.prototype.hasOwnProperty.call(data, field))
      .map((field) => [field, data[field]])
  );
}

function commandContext(
  req: ApiRequest,
  requiredControlPermission: "rbac:write" | "rbac:delete"
): RbacCommandContext {
  const actor = req.auth;
  if (!actor) {
    throw forbidden("Authentication is required");
  }
  const tenantCompanyId = req.tenant?.companyId ? canonicalUuid(req.tenant.companyId) : undefined;
  const actorCompanyId = actor.companyId ? canonicalUuid(actor.companyId) : undefined;
  if (tenantCompanyId && actorCompanyId && tenantCompanyId !== actorCompanyId) {
    throw forbidden("Invalid company context");
  }
  const companyId = tenantCompanyId ?? actorCompanyId;
  if (!companyId) {
    throw badRequest("Company context is required");
  }

  return {
    companyId,
    actorId: canonicalUuid(actor.id),
    ...(actor.sessionKind === "portfolio" ? { portfolioCeiling: actor.permissions ?? [] } : {}),
    requiredControlPermission,
    auditData: (event: RbacAuditEvent) => buildAuditData(req, { ...event, companyId })
  };
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
  if (!sameUuid(assignment.companyId, companyId) || !assignment.role) {
    return false;
  }
  if (assignment.role.companyId && !sameUuid(assignment.role.companyId, companyId)) {
    return false;
  }

  const clientScopeMatches = assignment.clientId
    ? sameUuid(assignment.clientId, rule.tenant?.clientId)
    : assignment.role.scope !== "CLIENT";
  const teamScopeMatches = assignment.teamId
    ? sameUuid(assignment.teamId, rule.tenant?.teamId)
    : assignment.role.scope !== "TEAM";
  if (!clientScopeMatches || !teamScopeMatches || assignment.role.isActive === false) {
    return false;
  }

  const required = `${rule.resource}:${rule.action}`;
  const permissions =
    assignment.role.permissions
      ?.filter(
        (item) => !item.permission?.companyId || sameUuid(item.permission.companyId, companyId)
      )
      .map((item) => `${item.permission?.resource}:${item.permission?.action}`) ?? [];
  return permissions.includes(required) || permissions.includes(superAdminPermission);
}

class RolesService extends BaseService {
  constructor(private readonly rbacRepository: RbacRepository) {
    super(rbacRepository.roles, "Role", { userStamps: false });
  }

  override async create(req: ApiRequest, data: Record<string, unknown>) {
    return this.rbacRepository.createRole(
      commandContext(req, "rbac:write"),
      pickAllowedFields(data, mutableRoleFields)
    );
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
    return this.rbacRepository.mutateRole(
      commandContext(req, "rbac:delete"),
      id,
      { deletedAt: new Date() },
      "SOFT_DELETE"
    );
  }

  override async update(req: ApiRequest, id: string, data: Record<string, unknown>) {
    return this.rbacRepository.mutateRole(
      commandContext(req, "rbac:write"),
      id,
      pickAllowedFields(data, mutableRoleFields),
      "UPDATE"
    );
  }

  async duplicate(req: ApiRequest, id: string) {
    return this.rbacRepository.duplicateRole(commandContext(req, "rbac:write"), id);
  }
}

class PermissionsService extends BaseService {
  constructor(private readonly rbacRepository: RbacRepository) {
    super(rbacRepository.permissions, "Permission", {
      userStamps: false,
      orderBy: [{ resource: "asc" }, { action: "asc" }, { id: "asc" }]
    });
  }

  override async create(req: ApiRequest, data: Record<string, unknown>) {
    return this.rbacRepository.createPermission(
      commandContext(req, "rbac:write"),
      pickAllowedFields(data, mutablePermissionFields)
    );
  }

  override async update(
    _req: ApiRequest,
    _id: string,
    _data: Record<string, unknown>
  ): Promise<never> {
    void _req;
    void _id;
    void _data;
    throw forbidden("Permission updates are not available through generic operations");
  }

  override async remove(_req: ApiRequest, _id: string): Promise<never> {
    void _req;
    void _id;
    throw forbidden("Permission removal is not available through generic operations");
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

  static async assignRole(req: ApiRequest, data: Record<string, unknown>) {
    const clientId = data.clientId ? String(data.clientId) : undefined;
    const teamId = data.teamId ? String(data.teamId) : undefined;
    const startsAt = data.startsAt instanceof Date ? data.startsAt : new Date();
    const endsAt = data.endsAt instanceof Date ? data.endsAt : undefined;
    if (endsAt && endsAt <= startsAt) {
      throw badRequest("endsAt must be later than startsAt");
    }

    return RbacService.repository.assignRole(commandContext(req, "rbac:write"), {
      userId: String(data.userId),
      roleId: String(data.roleId),
      ...(clientId ? { clientId } : {}),
      ...(teamId ? { teamId } : {}),
      ...(data.startsAt instanceof Date ? { startsAt } : {}),
      ...(endsAt ? { endsAt } : {})
    });
  }

  static async assignPermission(req: ApiRequest, roleId: string, permissionId: string) {
    return RbacService.repository.assignPermission(
      commandContext(req, "rbac:write"),
      roleId,
      permissionId
    );
  }

  static async removePermission(req: ApiRequest, roleId: string, permissionId: string) {
    return RbacService.repository.removePermission(
      commandContext(req, "rbac:write"),
      roleId,
      permissionId
    );
  }
}
