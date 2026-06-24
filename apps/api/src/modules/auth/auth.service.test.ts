import bcrypt from "bcryptjs";
import { describe, expect, it, vi } from "vitest";
import { AuthService } from "./auth.service.js";
import type { ApiRequest } from "../../shared/http/request-types.js";
import type { LoginDto } from "./auth.dto.js";
import type { AuthRepository } from "./auth.repository.js";

describe("AuthService", () => {
  it("stores selected company on refresh tokens during login", async () => {
    const mockRepository = {
      findUserByEmail: vi.fn().mockResolvedValue({
        id: "user-1",
        email: "user@example.com",
        passwordHash: "stored-bcrypt-password-hash",
        displayName: "Jane Doe",
        status: "ACTIVE",
        companies: [{ companyId: "company-a", isDefault: true }, { companyId: "company-b" }],
        roleAssignments: [
          {
            role: {
              permissions: [{ permission: { resource: "dashboard", action: "read" } }]
            }
          }
        ]
      }),
      createRefreshToken: vi.fn().mockResolvedValue(undefined),
      updateLastLogin: vi.fn().mockResolvedValue(undefined)
    };

    const service = new AuthService(mockRepository as unknown as AuthRepository);
    const req = {
      context: { userAgent: "test-agent", ipAddress: "127.0.0.1" }
    } as ApiRequest;
    const input: LoginDto = {
      email: "user@example.com",
      password: "test-login-password",
      companyId: "company-b"
    };

    vi.spyOn(bcrypt, "compare").mockImplementation(async () => true);

    const result = await service.login(req, input);

    expect(result.user.companyId).toBe("company-b");
    expect(mockRepository.createRefreshToken).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: "company-b",
        userId: "user-1"
      })
    );
  });

  it("restores tenant companyId from stored refresh token during refresh", async () => {
    const mockRepository = {
      findRefreshToken: vi.fn().mockResolvedValue({
        id: "refresh-1",
        userId: "user-1",
        companyId: "company-b",
        expiresAt: new Date(Date.now() + 1000 * 60),
        revokedAt: null,
        user: {
          id: "user-1",
          email: "user@example.com",
          displayName: "Jane Doe",
          status: "ACTIVE",
          companies: [{ companyId: "company-a", isDefault: true }, { companyId: "company-b" }],
          roleAssignments: [
            {
              role: {
                permissions: [{ permission: { resource: "dashboard", action: "read" } }]
              }
            }
          ]
        }
      }),
      rotateRefreshToken: vi.fn().mockResolvedValue(undefined)
    };

    const service = new AuthService(mockRepository as unknown as AuthRepository);
    const req = {
      context: { userAgent: "test-agent", ipAddress: "127.0.0.1" }
    } as ApiRequest;
    const result = await service.refresh(req, "valid-refresh-token");

    expect(result.user.companyId).toBe("company-b");
    expect(mockRepository.rotateRefreshToken).toHaveBeenCalledWith(
      "refresh-1",
      expect.objectContaining({ companyId: "company-b" })
    );
  });

  it("revokes refresh tokens on logout when a token is supplied", async () => {
    const mockRepository = {
      findRefreshToken: vi.fn().mockResolvedValue({
        id: "refresh-1",
        userId: "user-1",
        expiresAt: new Date(Date.now() + 1000 * 60),
        revokedAt: null
      }),
      revokeRefreshToken: vi.fn().mockResolvedValue(undefined)
    };

    const service = new AuthService(mockRepository as unknown as AuthRepository);
    const result = await service.logout("valid-refresh-token");

    expect(result).toEqual({ loggedOut: true });
    expect(mockRepository.revokeRefreshToken).toHaveBeenCalledWith("refresh-1");
  });

  it("returns success without revocation when no refresh token is supplied", async () => {
    const mockRepository = {
      findRefreshToken: vi.fn(),
      revokeRefreshToken: vi.fn()
    };

    const service = new AuthService(mockRepository as unknown as AuthRepository);
    const result = await service.logout(undefined);

    expect(result).toEqual({ loggedOut: true });
    expect(mockRepository.findRefreshToken).not.toHaveBeenCalled();
    expect(mockRepository.revokeRefreshToken).not.toHaveBeenCalled();
  });
});
