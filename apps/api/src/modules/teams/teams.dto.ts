// en-GB: Defines teams transfer shapes so data crossing application boundaries remains explicit.
export type CreateTeamDto = {
  name: string;
  description?: string;
  color?: string;
  defaultSlaMinutes?: number;
};
