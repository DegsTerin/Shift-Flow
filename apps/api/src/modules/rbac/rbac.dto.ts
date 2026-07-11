// en-GB: Defines rbac transfer shapes so data crossing application boundaries remains explicit.
export type PermissionCheckDto = {
  resource: string;
  action: string;
  companyId?: string;
  clientId?: string;
  teamId?: string;
};
