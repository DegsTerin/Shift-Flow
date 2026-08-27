// en-GB: Exercises role action guards so system profile restrictions remain truthful in the interface.
import { describe, expect, it } from "vitest";
import {
  canDuplicateRole,
  canManageProductRole,
  productCreatableRoleScopes
} from "./role-management-view";

describe("role management action guards", () => {
  it("allows an idle custom profile with an identity to be duplicated", () => {
    expect(canDuplicateRole({ id: "role-a", isSystem: false, scope: "COMPANY" }, false)).toBe(true);
  });

  it("blocks system profiles, busy state and missing identities", () => {
    expect(canDuplicateRole({ id: "system-role", isSystem: true, scope: "COMPANY" }, false)).toBe(
      false
    );
    expect(canDuplicateRole({ id: "role-a", isSystem: false, scope: "COMPANY" }, true)).toBe(false);
    expect(canDuplicateRole({ id: "client-role", scope: "CLIENT" }, false)).toBe(false);
    expect(canDuplicateRole(undefined, false)).toBe(false);
  });

  it("exposes only company-scoped profile creation in the product interface", () => {
    expect(productCreatableRoleScopes).toEqual(["COMPANY"]);
  });

  it("keeps system and limited profiles read-only in the product interface", () => {
    expect(canManageProductRole({ id: "company-role", scope: "COMPANY" })).toBe(true);
    expect(canManageProductRole({ id: "client-role", scope: "CLIENT" })).toBe(false);
    expect(canManageProductRole({ id: "system-role", scope: "COMPANY", isSystem: true })).toBe(
      false
    );
  });
});
