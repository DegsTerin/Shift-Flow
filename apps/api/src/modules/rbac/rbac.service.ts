import type { AuthenticatedUser, TenantContext } from "../../shared/http/request-types.js";
import { badRequest, forbidden } from "../../shared/errors/app-error.js";
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

export class RbacService {
  private static repository = new RbacRepository();
  static roles = new BaseService(RbacService.repository.roles, "Role", {
    userStamps: false
  });
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
        scoped && (permissions.includes(required) || permissions.includes(superAdminPermission))
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
}
