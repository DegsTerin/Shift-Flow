// en-GB: Exercises role action guards so system profile restrictions remain truthful in the interface.
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { messages } from "../lib/i18n";
import type { PermissionRef, RoleRef } from "../lib/types";
import {
  RoleManagementView,
  canDuplicateRole,
  canManageProductRole,
  productCreatableRoleScopes
} from "./role-management-view";

vi.mock("react", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    useMemo: (factory: () => unknown) => factory(),
    useState: (initial: unknown) => [
      typeof initial === "function" ? (initial as () => unknown)() : initial,
      vi.fn()
    ]
  };
});

function roleMarkup(canWrite: boolean, canDelete: boolean) {
  const assignedPermission: PermissionRef = {
    id: "permission-assigned",
    resource: "activities",
    action: "read"
  };
  const roles: RoleRef[] = [
    {
      id: "role-a",
      name: "Role A",
      scope: "COMPANY",
      isSystem: false,
      _count: { assignments: 0 },
      permissions: [
        {
          id: "role-permission-a",
          permissionId: assignedPermission.id,
          permission: assignedPermission
        }
      ]
    }
  ];
  return RoleManagementView({
    t: messages["pt-BR"],
    roles,
    permissions: [
      assignedPermission,
      { id: "permission-available", resource: "activities", action: "write" }
    ],
    busy: false,
    canWrite,
    canDelete,
    onCreateRole: vi.fn(),
    onUpdateRole: vi.fn(),
    onAssignPermission: vi.fn(),
    onRemovePermission: vi.fn(),
    onDuplicateRole: vi.fn(),
    onDeleteRole: vi.fn()
  });
}

function elements(node: unknown): ReactElement[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const element = node as ReactElement;
  return [element, ...elements((element.props as { children?: unknown }).children)];
}

function textOf(node: unknown): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join(" ");
  if (!node || typeof node !== "object" || !("props" in node)) return "";
  return textOf(((node as ReactElement).props as { children?: unknown }).children);
}

function buttonsByLabel(tree: ReactElement, label: string) {
  const matches = elements(tree).filter(
    (element) => element.type === "button" && textOf(element).trim() === label
  );
  if (!matches.length) throw new Error(`Button not found: ${label}`);
  return matches;
}

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
    expect(canDuplicateRole({ id: "role-a", scope: "COMPANY" }, false, false)).toBe(false);
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

  it("disables every write control without write permission while preserving delete authority", () => {
    const markup = roleMarkup(false, true);

    [
      messages["pt-BR"].save,
      messages["pt-BR"].duplicate,
      messages["pt-BR"].add,
      messages["pt-BR"].remove
    ].forEach((label) => {
      buttonsByLabel(markup, label).forEach((button) =>
        expect((button.props as { disabled?: boolean }).disabled).toBe(true)
      );
    });
    buttonsByLabel(markup, messages["pt-BR"].delete).forEach((button) =>
      expect((button.props as { disabled?: boolean }).disabled).toBe(false)
    );
  });

  it("preserves write controls while disabling deletion without delete permission", () => {
    const markup = roleMarkup(true, false);

    [
      messages["pt-BR"].save,
      messages["pt-BR"].duplicate,
      messages["pt-BR"].add,
      messages["pt-BR"].remove
    ].forEach((label) => {
      buttonsByLabel(markup, label).forEach((button) =>
        expect((button.props as { disabled?: boolean }).disabled).toBe(false)
      );
    });
    buttonsByLabel(markup, messages["pt-BR"].delete).forEach((button) =>
      expect((button.props as { disabled?: boolean }).disabled).toBe(true)
    );
  });

  it("gives the permission selector an accessible name", () => {
    const selector = elements(roleMarkup(true, false)).find(
      (element) =>
        element.type === "select" &&
        (element.props as { "aria-label"?: string })["aria-label"] ===
          messages["pt-BR"].permissionsLabel
    );

    expect(selector).toBeDefined();
  });
});
