// en-GB: Defines notifications transfer shapes so data crossing application boundaries remains explicit.
export type CreateNotificationDto = {
  recipientId: string;
  type: string;
  title: string;
  body?: string;
};
