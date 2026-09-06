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
  capabilities: RecordModalCapabilities,
  busy = false
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
    busy,
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
  it.each([
    { status: "PLANNED", labels: ["Open shift", "Close shift", "Cancel shift"] },
    { status: "OPEN", labels: ["Close shift", "Cancel shift"] },
    { status: "REOPENED", labels: ["Close shift", "Cancel shift"] },
    { status: "CLOSED", labels: ["Reopen shift"] },
    { status: "CANCELLED", labels: [] },
    { status: "UNKNOWN", labels: [] }
  ])("shows the precise Shift command matrix for $status", ({ status, labels }) => {
    const tree = GenericDetail({
      entity: "shifts",
      record: { ...recordFor("shifts"), status },
      t: messages["en-GB"],
      users: [],
      roles: [],
      editing: false,
      busy: false,
      capabilities: { ...none, canWrite: true },
      setEditing: vi.fn(),
      onSubmit: vi.fn(),
      onRemove: vi.fn(),
      onAddTeamMember: vi.fn(),
      onRemoveTeamMember: vi.fn(),
      onShiftTransition: vi.fn(async () => undefined)
    });
    const commands = expandedElements(tree).filter(
      (element) => element.type === "button" && textOf(element).includes("shift")
    );
    expect(commands.map(textOf)).toEqual(labels);
    expect(
      commands.every(
        (element) =>
          (element.props as { type: string; disabled: boolean }).type === "button" &&
          !(element.props as { disabled: boolean }).disabled
      )
    ).toBe(true);
  });

  it.each([
    { busy: true, editing: false },
    { busy: false, editing: true }
  ])("blocks Shift transition buttons during busy=$busy/editing=$editing", ({ busy, editing }) => {
    const onShiftTransition = vi.fn(async () => undefined);
    const tree = GenericDetail({
      entity: "shifts",
      record: { ...recordFor("shifts"), status: "PLANNED" },
      t: messages["en-GB"],
      users: [],
      roles: [],
      editing,
      busy,
      capabilities: { ...none, canWrite: true },
      setEditing: vi.fn(),
      onSubmit: vi.fn(),
      onRemove: vi.fn(),
      onAddTeamMember: vi.fn(),
      onRemoveTeamMember: vi.fn(),
      onShiftTransition
    });
    const commands = expandedElements(tree).filter(
      (element) => element.type === "button" && textOf(element).includes("shift")
    );
    expect(commands).toHaveLength(3);
    for (const command of commands) {
      const props = command.props as { disabled: boolean; onClick: () => void };
      expect(props.disabled).toBe(true);
      props.onClick();
    }
    expect(onShiftTransition).not.toHaveBeenCalled();
  });

  it("keeps Shift command authority independent from delete authority", () => {
    for (const capabilities of [none, { ...none, canDelete: true }]) {
      const tree = renderGeneric("shifts", capabilities);
      expect(
        expandedElements(tree).filter(
          (element) => element.type === "button" && textOf(element).includes("shift")
        )
      ).toHaveLength(0);
    }
  });

  it("dispatches the selected valid Shift command without submitting an edit", () => {
    const onShiftTransition = vi.fn(async () => undefined);
    const onSubmit = vi.fn();
    const tree = GenericDetail({
      entity: "shifts",
      record: { ...recordFor("shifts"), status: "CLOSED" },
      t: messages["en-GB"],
      users: [],
      roles: [],
      editing: false,
      busy: false,
      capabilities: { ...none, canWrite: true },
      setEditing: vi.fn(),
      onSubmit,
      onRemove: vi.fn(),
      onAddTeamMember: vi.fn(),
      onRemoveTeamMember: vi.fn(),
      onShiftTransition
    });
    const reopen = expandedElements(tree).find(
      (element) => element.type === "button" && textOf(element) === "Reopen shift"
    );
    (reopen?.props as { onClick: () => void }).onClick();
    expect(onShiftTransition).toHaveBeenCalledWith("reopen");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("wires UTF-8 byte validation into edited user passwords", () => {
    const tree = renderGeneric("users", { ...none, canWrite: true });
    const password = expandedElements(tree).find(
      (element) =>
        element.type === "input" && (element.props as { name?: string }).name === "password"
    );
    const setCustomValidity = vi.fn();

    expect(password?.props).toMatchObject({ maxLength: 72 });
    (
      password?.props as {
        onInput: (event: {
          currentTarget: { value: string; setCustomValidity: typeof setCustomValidity };
        }) => void;
      }
    ).onInput({ currentTarget: { value: `Aa1!${"é".repeat(35)}`, setCustomValidity } });
    expect(setCustomValidity).toHaveBeenCalledWith(messages["en-GB"].passwordUtf8Limit);
  });

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

  it("freezes the generic edit-state toggle while a modal mutation is pending", () => {
    const idleTree = renderGeneric("clients", { ...none, canWrite: true });
    const busyTree = renderGeneric("clients", { ...none, canWrite: true }, true);
    const editButton = (tree: unknown) =>
      expandedElements(tree).find(
        (element) => element.type === "button" && textOf(element).includes(messages["en-GB"].edit)
      );

    expect((editButton(idleTree)?.props as { disabled?: boolean }).disabled).toBe(false);
    expect((editButton(busyTree)?.props as { disabled?: boolean }).disabled).toBe(true);
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
