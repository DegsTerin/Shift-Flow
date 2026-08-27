// en-GB: Preserves role update payload semantics when immutable controls are omitted by the browser.
import { describe, expect, it } from "vitest";
import {
  productAssignableRoles,
  roleUpdatePayload,
  userPayload,
  userRoleId,
  userRoleOptions
} from "./utils";

describe("roleUpdatePayload", () => {
  it("does not invent a company scope when the scope control is absent", () => {
    const form = new FormData();
    form.set("name", "Client operator");
    form.set("color", "#0f766e");
    form.set("isActive", "on");

    expect(roleUpdatePayload(form)).toEqual({
      name: "Client operator",
      color: "#0f766e",
      isActive: true,
      description: undefined
    });
  });

  it("preserves an explicitly submitted scope", () => {
    const form = new FormData();
    form.set("name", "Client operator");
    form.set("scope", "CLIENT");

    expect(roleUpdatePayload(form)).toMatchObject({ scope: "CLIENT" });
  });
});

describe("product role assignment", () => {
  it("offers only active company-scoped profiles in the user editor", () => {
    expect(
      productAssignableRoles([
        { id: "company-role", scope: "COMPANY", isActive: true },
        { id: "inactive-role", scope: "COMPANY", isActive: false },
        { id: "client-role", scope: "CLIENT", isActive: true }
      ])
    ).toEqual([{ id: "company-role", scope: "COMPANY", isActive: true }]);
  });

  it("does not present a limited assignment as the editable company profile", () => {
    expect(
      userRoleId({
        roleAssignments: [
          { roleId: "client-role", role: { id: "client-role", scope: "CLIENT" } },
          {
            roleId: "company-role",
            endsAt: null,
            role: { id: "company-role", scope: "COMPANY", isActive: true }
          }
        ]
      })
    ).toBe("company-role");
  });

  it("keeps a limited-only user unassigned in unrelated company-profile edits", () => {
    const user = {
      roleAssignments: [{ roleId: "client-role", role: { id: "client-role", scope: "CLIENT" } }]
    };
    const form = new FormData();
    form.set("displayName", "Limited user");
    form.set("roleId", userRoleId(user));

    expect(userRoleId(user)).toBe("");
    expect(userPayload(form)).not.toHaveProperty("roleId");
  });

  it("offers an empty placeholder only when no company profile is currently assigned", () => {
    const roles = [{ id: "company-role", name: "Operator", scope: "COMPANY" }];
    const companyUser = {
      roleAssignments: [
        {
          roleId: "company-role",
          endsAt: null,
          role: { id: "company-role", scope: "COMPANY", isActive: true }
        }
      ]
    };
    const limitedUser = {
      roleAssignments: [{ roleId: "client-role", role: { id: "client-role", scope: "CLIENT" } }]
    };

    expect(userRoleOptions(companyUser, roles)).toEqual([["company-role", "Operator"]]);
    expect(userRoleOptions(limitedUser, roles)).toEqual([
      ["", "Sem perfil de empresa"],
      ["company-role", "Operator"]
    ]);
  });

  it("does not widen a dimension-limited company role through the simple editor", () => {
    const user = {
      roleAssignments: [
        {
          roleId: "dimensioned-role",
          clientId: "client-a",
          role: { id: "dimensioned-role", scope: "COMPANY", isActive: true }
        }
      ]
    };

    expect(userRoleId(user)).toBe("");
    expect(userRoleOptions(user, [])).toEqual([["", "Sem perfil de empresa"]]);
  });

  it("preserves an active current company role that is outside the loaded role page", () => {
    const user = {
      roleAssignments: [
        {
          roleId: "current-role",
          endsAt: null,
          role: {
            id: "current-role",
            name: "Current operator",
            scope: "COMPANY",
            isActive: true
          }
        }
      ]
    };

    expect(userRoleOptions(user, [])).toEqual([["current-role", "Current operator (atual)"]]);
  });

  it("preserves a time-bounded company role outside the simple editor", () => {
    const user = {
      roleAssignments: [
        {
          roleId: "temporary-role",
          endsAt: "2030-01-01T00:00:00.000Z",
          role: { id: "temporary-role", scope: "COMPANY", isActive: true }
        }
      ]
    };

    expect(userRoleId(user)).toBe("");
    expect(userRoleOptions(user, [])).toEqual([["", "Sem perfil de empresa"]]);
  });

  it("does not submit an inactive company role during unrelated edits", () => {
    const user = {
      roleAssignments: [
        {
          roleId: "inactive-role",
          role: { id: "inactive-role", scope: "COMPANY", isActive: false }
        }
      ]
    };

    expect(userRoleId(user)).toBe("");
    expect(userRoleOptions(user, [])).toEqual([["", "Sem perfil de empresa"]]);
  });
});
