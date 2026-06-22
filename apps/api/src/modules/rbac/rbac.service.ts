import type { AuthenticatedUser, TenantContext } from "../../shared/http/request-types.js";
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
    userStamps: false,
  });
  static permissions = new BaseService(RbacService.repository.permissions, "Permission", {
    userStamps: false,
  });

  static async hasPermission(user: AuthenticatedUser, rule: PermissionRule) {
    const required = `${rule.resource}:${rule.action}`;
    const companyId = rule.tenant?.companyId ?? user.companyId;

    const assignments = (await RbacService.repository.findAssignmentsForUser(
      user.id,
      companyId,
    )) as Assignment[];

    return assignments.some((assignment) => {
      const scoped =
        (!rule.tenant?.clientId || assignment.clientId === rule.tenant.clientId) &&
        (!rule.tenant?.teamId || assignment.teamId === rule.tenant.teamId);
      const permissions =
        assignment.role?.permissions?.map(
          (item) => `${item.permission?.resource}:${item.permission?.action}`,
        ) ?? [];

      return scoped && (permissions.includes(required) || permissions.includes(superAdminPermission));
    });
  }

  static async assignRole(data: Record<string, unknown>) {
    return RbacService.repository.assignRole(data);
  }

  static async assignPermission(roleId: string, permissionId: string, companyId?: string) {
    return RbacService.repository.assignPermission(roleId, permissionId, companyId);
  }
}
