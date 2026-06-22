export type PermissionCheckDto = {
  resource: string;
  action: string;
  companyId?: string;
  clientId?: string;
  teamId?: string;
};
