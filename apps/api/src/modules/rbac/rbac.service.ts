// en-GB: Implements rbac rules so invariants remain centralised outside the transport layer.
import type {
  ApiRequest,
  AuthenticatedUser,
  TenantContext
} from "../../shared/http/request-types.js";
import { toPagination, toSkipTake } from "../../shared/http/pagination.js";
import { badRequest, forbidden, notFound } from "../../shared/errors/app-error.js";
import { BaseService } from "../../shared/services/base.service.js";
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
    permissions?: Array<{
      permission?: { resource?: string; action?: string };
    }>;
  };
};

const superAdminPermission = "*:*";
const roleInclude = {
  permissions: {
    include: { permission: true },
    orderBy: { createdAt: "asc" }
  },
  _count: {
    select: {
      assignments: {
        where: {
          deletedAt: null,
          OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }]
        }
      }
    }
  }
};

class RolesService extends BaseService {
  constructor(private readonly rbacRepository: RbacRepository) {
    super(rbacRepository.roles, "Role", { userStamps: false });
  }

  override async list(req: ApiRequest, filters: Record<string, unknown> = {}) {
    const pagination = toPagination(req.query);
    const companyId = this.requireCompanyId(req);
    const where = { ...filters, companyId, deletedAt: null };
    const [items, total] = await Promise.all([
      this.repository.list({
        where,
        ...toSkipTake(pagination),
        orderBy: { updatedAt: "desc" },
        include: roleInclude
      }),
      this.repository.count(where)
    ]);

    return { items, total, ...pagination };
  }

  override async get(req: ApiRequest, id: string) {
    const item = await this.repository.findById(id, this.requireCompanyId(req), roleInclude);
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
    const role = await this.rbacRepository.findRole(id, companyId);
    if (!role) {
      throw notFound("Role not found");
    }
    if (role.isSystem) {
      throw badRequest("System profiles cannot be deleted");
    }
    const assignmentCount = await this.rbacRepository.countActiveAssignments(id, companyId);
    if (assignmentCount > 0) {
      throw badRequest("Profile is in use and cannot be deleted");
    }
    return super.remove(req, id);
  }

  override async update(req: ApiRequest, id: string, data: Record<string, unknown>) {
    const companyId = this.requireCompanyId(req);
    if (!companyId) {
      throw badRequest("Company context is required");
    }
    const role = await this.rbacRepository.findRole(id, companyId);
    if (!role) {
      throw notFound("Role not found");
    }
    if (role.isSystem) {
      throw badRequest("System profiles cannot be edited");
    }
    return super.update(req, id, data);
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
    return this.rbacRepository.duplicateRole(id, companyId, `${role.name ?? "Perfil"} - copia`);
  }
}

export class RbacService {
  private static repository = new RbacRepository();
  static roles = new RolesService(RbacService.repository);
  static permissions = new BaseService(RbacService.repository.permissions, "Permission", {
    userStamps: false
  });

  static async hasPermission(user: AuthenticatedUser, rule: PermissionRule) {
    const required = `${rule.resource}:${rule.action}`;
    if (rule.tenant?.companyId && rule.tenant.companyId !== user.companyId) {
      return false;
    }
    const companyId = rule.tenant?.companyId ?? user.companyId;

    const assignments = (await RbacService.repository.findAssignmentsForUser(
      user.id,
      companyId
    )) as Assignment[];

    return assignments.some((assignment) => {
      const scoped =
        (!rule.tenant?.clientId || assignment.clientId === rule.tenant.clientId) &&
        (!rule.tenant?.teamId || assignment.teamId === rule.tenant.teamId);
      const permissions =
        assignment.role?.permissions?.map(
          (item) => `${item.permission?.resource}:${item.permission?.action}`
        ) ?? [];

      return (
        scoped &&
        assignment.role &&
        (assignment.role as { isActive?: boolean }).isActive !== false &&
        (permissions.includes(required) || permissions.includes(superAdminPermission))
      );
    });
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
    if (String(data.companyId) !== companyId) {
      throw forbidden("Cannot assign roles outside the active company");
    }

    const role = await RbacService.repository.findRole(String(data.roleId), companyId);
    if (!role) {
      throw badRequest("Role does not belong to the active company");
    }

    const userCompany = await RbacService.repository.findUserCompany(
      String(data.userId),
      companyId
    );
    if (!userCompany) {
      throw badRequest("User is not linked to the active company");
    }

    return RbacService.repository.assignRole(data);
  }

  static async assignPermission(
    actor: AuthenticatedUser | undefined,
    tenant: TenantContext | undefined,
    roleId: string,
    permissionId: string,
    requestedCompanyId?: string
  ) {
    const companyId = RbacService.effectiveCompany(actor, tenant);
    if (requestedCompanyId && requestedCompanyId !== companyId) {
      throw forbidden("Cannot assign permissions outside the active company");
    }

    const [role, permission] = await Promise.all([
      RbacService.repository.findRole(roleId, companyId),
      RbacService.repository.findPermission(permissionId, companyId)
    ]);
    if (!role) {
      throw badRequest("Role does not belong to the active company");
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
    return RbacService.repository.removePermission(roleId, permissionId, companyId);
  }
}
