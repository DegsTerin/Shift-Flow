import type { Request } from "express";

export type AuthenticatedUser = {
  id: string;
  email: string;
  companyId?: string;
  permissions?: string[];
};

export type RequestContext = {
  requestId: string;
  ipAddress?: string;
  userAgent?: string;
};

export type TenantContext = {
  companyId?: string;
  clientId?: string;
  teamId?: string;
  shiftId?: string;
};

export type ApiRequest = Request & {
  auth?: AuthenticatedUser;
  context?: RequestContext;
  tenant?: TenantContext;
};
