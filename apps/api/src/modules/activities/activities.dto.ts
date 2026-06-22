export type CreateActivityDto = {
  clientId: string;
  teamId: string;
  shiftId?: string;
  assigneeId?: string;
  title: string;
  description?: string;
  systemName?: string;
  serviceName?: string;
  priority?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  slaDueAt?: Date;
};
