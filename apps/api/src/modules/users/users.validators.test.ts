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
});
