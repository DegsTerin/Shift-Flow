// en-GB: Defines shifts transfer shapes so data crossing application boundaries remains explicit.
export type CreateShiftDto = {
  name: string;
  startsAt: Date;
  endsAt: Date;
  timezone?: string;
};
