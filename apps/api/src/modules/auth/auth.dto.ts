export type LoginDto = {
  email: string;
  password: string;
  companyId?: string;
};

export type RefreshTokenDto = {
  refreshToken: string;
};
