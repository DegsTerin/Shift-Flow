export type CreateNotificationDto = {
  recipientId: string;
  type: string;
  title: string;
  body?: string;
};
