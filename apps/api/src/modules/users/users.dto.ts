export type CreateUserDto = {
  email: string;
  password: string;
  displayName: string;
  jobTitle?: string;
  status?: "INVITED" | "ACTIVE" | "INACTIVE" | "LOCKED";
  preferredLocale?: "PT_BR" | "EN_GB";
  preferredTheme?: "SYSTEM" | "LIGHT" | "DARK";
};
