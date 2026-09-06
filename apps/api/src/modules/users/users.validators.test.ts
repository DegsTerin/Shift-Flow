// en-GB: Locks the user role contract so creation cannot select an arbitrary fallback profile.
import { describe, expect, it } from "vitest";
import { createUserSchema, updateUserSchema } from "./users.validators.js";

const user = {
  email: "user@example.com",
  password: "CorrectHorseBattery1!",
  displayName: "Example user"
};

describe("user validators", () => {
  it("requires an explicit role when creating a user", () => {
    expect(createUserSchema.safeParse(user).success).toBe(false);
    expect(createUserSchema.safeParse({ ...user, roleId: crypto.randomUUID() }).success).toBe(true);
  });

  it("keeps role selection optional for unrelated user updates", () => {
    expect(updateUserSchema.safeParse({ displayName: "Updated user" }).success).toBe(true);
  });

  it("accepts 72 ASCII password bytes and rejects 73 on create and update", () => {
    const accepted = `Aa1!${"x".repeat(68)}`;
    const rejected = `${accepted}x`;
    const roleId = crypto.randomUUID();

    expect(createUserSchema.safeParse({ ...user, roleId, password: accepted }).success).toBe(true);
    expect(createUserSchema.safeParse({ ...user, roleId, password: rejected }).success).toBe(false);
    expect(updateUserSchema.safeParse({ password: accepted }).success).toBe(true);
    expect(updateUserSchema.safeParse({ password: rejected }).success).toBe(false);
  });

  it("rejects a multibyte new password above 72 UTF-8 bytes", () => {
    const accepted = `Aa1!${"é".repeat(34)}`;
    const rejected = `${accepted}é`;

    expect(updateUserSchema.safeParse({ password: accepted }).success).toBe(true);
    expect(updateUserSchema.safeParse({ password: rejected }).success).toBe(false);
  });
});
