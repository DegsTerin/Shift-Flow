// en-GB: Defines auth transfer shapes so data crossing application boundaries remains explicit.
export type LoginDto = {
  email: string;
  password: string;
  companyId?: string;
};
