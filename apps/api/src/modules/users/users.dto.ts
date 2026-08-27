// en-GB: Defines users transfer shapes so data crossing application boundaries remains explicit.
export type CreateUserDto = {
  email: string;
  password: string;
  displayName: string;
  roleId: string;
  jobTitle?: string;
  status?: "INVITED" | "ACTIVE" | "INACTIVE" | "LOCKED";
  preferredLocale?: "PT_BR" | "EN_GB";
  preferredTheme?: "SYSTEM" | "LIGHT" | "DARK";
};
