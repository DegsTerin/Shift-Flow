// en-GB: Defines reports transfer shapes so data crossing application boundaries remains explicit.
export type ShiftReportDto = {
  shiftId: string;
  teamId: string;
  summary: string;
  pendingNotes?: string;
};
