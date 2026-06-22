export type CreateShiftDto = {
  teamId: string;
  name: string;
  startsAt: Date;
  endsAt: Date;
  timezone?: string;
};
