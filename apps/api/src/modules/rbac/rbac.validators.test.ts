// en-GB: Exercises RBAC public contracts so tenant-owned and system-owned fields remain immutable.
import { describe, expect, it } from "vitest";
import {
  assignRoleSchema,
  permissionCreateSchema,
  roleCreateSchema,
  roleUpdateSchema
} from "./rbac.validators.js";

describe("RBAC validators", () => {
  it.each([roleCreateSchema, roleUpdateSchema])("rejects protected role fields", (schema) => {
    expect(schema.safeParse({ name: "Operator", companyId: crypto.randomUUID() }).success).toBe(
      false
    );
    expect(schema.safeParse({ name: "Operator", isSystem: true }).success).toBe(false);
  });

  it("accepts the current mutable role payload", () => {
    expect(
      roleCreateSchema.safeParse({
        name: "Operator",
        description: "Operational access",
        color: "#0f766e",
        scope: "COMPANY",
        isActive: true
      }).success
    ).toBe(true);
  });

  it("does not inject a scope default into partial updates", () => {
    expect(roleUpdateSchema.parse({ name: "Renamed role" })).toEqual({
      name: "Renamed role"
    });
    expect(roleUpdateSchema.parse({})).toEqual({});
  });

  it("reserves global scope for controlled system records", () => {
    expect(roleCreateSchema.safeParse({ name: "Global role", scope: "GLOBAL" }).success).toBe(
      false
    );
  });

  it("rejects protected permission fields", () => {
    expect(
      permissionCreateSchema.safeParse({
        resource: "activities",
        action: "read",
        companyId: crypto.randomUUID()
      }).success
    ).toBe(false);
    expect(
      permissionCreateSchema.safeParse({
        resource: "activities",
        action: "read",
        isSystem: true
      }).success
    ).toBe(false);
  });

  it("derives assignment company from the session and validates its interval", () => {
    const base = {
      userId: crypto.randomUUID(),
      roleId: crypto.randomUUID()
    };

    expect(assignRoleSchema.safeParse({ ...base, companyId: crypto.randomUUID() }).success).toBe(
      false
    );
    expect(
      assignRoleSchema.safeParse({
        ...base,
        startsAt: "2026-08-27T12:00:00.000Z",
        endsAt: "2026-08-27T11:59:59.000Z"
      }).success
    ).toBe(false);
  });
});
