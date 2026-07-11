// en-GB: Defines audit transfer shapes so data crossing application boundaries remains explicit.
export type AuditFilterDto = {
  entityType?: string;
  entityId?: string;
  action?: string;
  actorUserId?: string;
};
