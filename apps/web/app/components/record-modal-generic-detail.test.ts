// en-GB: Verifies generic detail and team-membership controls against independent capabilities.
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { messages } from "../lib/i18n";
import type { RecordModalCapabilities, View } from "../lib/types";

vi.mock("react", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    useState: (initial: unknown) => [
      typeof initial === "function" ? (initial as () => unknown)() : initial,
      vi.fn()
    ]
  };
});

import { GenericDetail } from "./record-modal";
import { ReferenceSelectInput } from "./controls";

const none: RecordModalCapabilities = {
  canWrite: false,
  canDelete: false,
  canComment: false,
  canAddMembers: false,
  canRemoveMembers: false
};

function recordFor(entity: View) {
  if (entity === "users") return { id: "user-a", email: "user-a@example.com" };
  if (entity === "clients") return { id: "client-a", name: "Client A" };
  if (entity === "teams") {
    return {
      id: "team-a",
      name: "Team A",
      members: [
        {
          id: "member-a",
          userId: "user-a",
          role: "MEMBER" as const,
          user: { id: "user-a", displayName: "User A" }
        }
      ]
    };
  }
  return {
    id: "shift-a",
    name: "Shift A",
    startsAt: "2026-08-28T08:00:00.000Z",
    endsAt: "2026-08-28T16:00:00.000Z",
    status: "OPEN"
  };
}

function renderGeneric(
  entity: "users" | "clients" | "teams" | "shifts",
  capabilities: RecordModalCapabilities
) {
  return GenericDetail({
    entity,
    record: recordFor(entity),
    t: messages["en-GB"],
    users: [
      { id: "user-a", displayName: "User A" },
      { id: "user-b", displayName: "User B" }
    ],
    roles: [],
    editing: false,
    busy: false,
    capabilities,
    setEditing: vi.fn(),
    onSubmit: vi.fn(),
    onRemove: vi.fn(),
    onAddTeamMember: vi.fn(async () => undefined),
    onRemoveTeamMember: vi.fn(async () => undefined)
  });
}

function expandedElements(node: unknown): ReactElement[] {
  if (Array.isArray(node)) return node.flatMap(expandedElements);
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const element = node as ReactElement;
  if (element.type === ReferenceSelectInput) return [element];
  if (typeof element.type === "function") {
    return expandedElements((element.type as (props: unknown) => unknown)(element.props));
  }
  return [element, ...expandedElements((element.props as { children?: unknown }).children)];
}

function textOf(node: unknown): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join(" ");
  if (!node || typeof node !== "object" || !("props" in node)) return "";
  const element = node as ReactElement;
  if (element.type === ReferenceSelectInput) return "";
  if (typeof element.type === "function") {
    return textOf((element.type as (props: unknown) => unknown)(element.props));
  }
  return textOf((element.props as { children?: unknown }).children);
}

describe("GenericDetail capability matrix", () => {
  for (const entity of ["users", "clients", "teams", "shifts"] as const) {
    it(`keeps ${entity} read-only without write or delete controls`, () => {
      const text = textOf(renderGeneric(entity, none));

      expect(text).not.toContain(messages["en-GB"].edit);
      expect(text).not.toContain(messages["en-GB"].delete);
    });

    it(`separates ${entity} write from delete authority`, () => {
      const writeText = textOf(renderGeneric(entity, { ...none, canWrite: true }));
      const deleteText = textOf(renderGeneric(entity, { ...none, canDelete: true }));

      expect(writeText).toContain(messages["en-GB"].edit);
      expect(writeText).not.toContain(messages["en-GB"].delete);
      expect(deleteText).not.toContain(messages["en-GB"].edit);
      expect(deleteText).toContain(messages["en-GB"].delete);
    });
  }

  it("does not derive team membership controls from team write", () => {
    const tree = renderGeneric("teams", { ...none, canWrite: true });
    const buttons = expandedElements(tree).filter((element) => element.type === "button");
    const text = buttons.map(textOf).join(" ");

    expect(text).not.toContain(messages["en-GB"].add);
    expect(text).not.toContain(messages["en-GB"].remove);
  });

  it("separates member addition from removal authority", () => {
    const addTree = renderGeneric("teams", { ...none, canAddMembers: true });
    const removeTree = renderGeneric("teams", { ...none, canRemoveMembers: true });
    const addButtons = expandedElements(addTree).filter((element) => element.type === "button");
    const removeButtons = expandedElements(removeTree).filter(
      (element) => element.type === "button"
    );
    const addText = addButtons.map(textOf).join(" ");
    const removeText = removeButtons.map(textOf).join(" ");

    expect(addText).toContain(messages["en-GB"].add);
    expect(addText).not.toContain(messages["en-GB"].remove);
    expect(removeText).not.toContain(messages["en-GB"].add);
    expect(removeText).toContain(messages["en-GB"].remove);
  });

  it("shows add and remove when both membership capabilities are available", () => {
    const tree = renderGeneric("teams", {
      ...none,
      canAddMembers: true,
      canRemoveMembers: true
    });
    const buttons = expandedElements(tree).filter((element) => element.type === "button");
    const text = buttons.map(textOf).join(" ");

    expect(text).toContain(messages["en-GB"].add);
    expect(text).toContain(messages["en-GB"].remove);
  });

  it("keeps the team-role choice enabled when remote users can exist beyond the initial page", () => {
    const tree = GenericDetail({
      entity: "teams",
      record: recordFor("teams"),
      t: messages["en-GB"],
      users: [{ id: "user-a", displayName: "User A" }],
      roles: [],
      editing: false,
      busy: false,
      capabilities: { ...none, canAddMembers: true },
      setEditing: vi.fn(),
      onSubmit: vi.fn(),
      onRemove: vi.fn(),
      onAddTeamMember: vi.fn(async () => undefined),
      onRemoveTeamMember: vi.fn(async () => undefined)
    });
    const roleSelect = expandedElements(tree).find((element) => element.type === "select");

    expect((roleSelect?.props as { disabled?: boolean }).disabled).toBe(false);
  });

  it("does not offer profile removal when the API contract only supports replacement", () => {
    const tree = GenericDetail({
      entity: "users",
      record: {
        id: "user-a",
        email: "user-a@example.com",
        roleAssignments: [
          {
            roleId: "role-a",
            endsAt: null,
            role: { id: "role-a", name: "Operator", scope: "COMPANY", isActive: true }
          }
        ]
      },
      t: messages["en-GB"],
      users: [],
      roles: [{ id: "role-a", name: "Operator", scope: "COMPANY", isActive: true }],
      editing: true,
      busy: false,
      capabilities: { ...none, canWrite: true },
      setEditing: vi.fn(),
      onSubmit: vi.fn(),
      onRemove: vi.fn(),
      onAddTeamMember: vi.fn(async () => undefined),
      onRemoveTeamMember: vi.fn(async () => undefined)
    });
    const roleSelect = expandedElements(tree).find(
      (element) =>
        element.type === ReferenceSelectInput &&
        (element.props as { name?: string }).name === "roleId"
    );

    expect(roleSelect?.props).toMatchObject({ value: "role-a" });
    expect((roleSelect?.props as { placeholder?: string }).placeholder).toBeUndefined();
  });

  it("keeps Shift lifecycle status read-only while content fields are editable", () => {
    const tree = GenericDetail({
      entity: "shifts",
      record: recordFor("shifts"),
      t: messages["en-GB"],
      users: [],
      roles: [],
      editing: true,
      busy: false,
      capabilities: { ...none, canWrite: true },
      setEditing: vi.fn(),
      onSubmit: vi.fn(),
      onRemove: vi.fn(),
      onAddTeamMember: vi.fn(async () => undefined),
      onRemoveTeamMember: vi.fn(async () => undefined)
    });
    const controls = expandedElements(tree);
    const nameInput = controls.find(
      (element) => element.type === "input" && (element.props as { name?: string }).name === "name"
    );
    const statusSelect = controls.find(
      (element) =>
        element.type === "select" && (element.props as { name?: string }).name === "status"
    );

    expect((nameInput?.props as { disabled?: boolean }).disabled).toBe(false);
    expect((statusSelect?.props as { disabled?: boolean }).disabled).toBe(true);
  });
});
