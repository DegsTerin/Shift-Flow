export type CreateShiftDto = {
  name: string;
  startsAt: Date;
  endsAt: Date;
  timezone?: string;
};
