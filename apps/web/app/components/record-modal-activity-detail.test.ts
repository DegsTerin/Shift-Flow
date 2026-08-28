// en-GB: Verifies that activity detail controls mirror independent backend capabilities.
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { messages } from "../lib/i18n";
import type { RecordModalCapabilities } from "../lib/types";
import { SelectInput } from "./controls";
import { ActivityDetail } from "./record-modal-activity-detail";
import { InternalTaskBoard } from "./record-modal-task-board";

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

function renderDetail(capabilities: RecordModalCapabilities) {
  return ActivityDetail({
    activity: { id: "activity-a", title: "Activity A", status: "PENDING" },
    t: messages["en-GB"],
    token: "access-token",
    locale: "en-GB",
    clients: [],
    users: [],
    teams: [],
    shifts: [],
    editing: false,
    busy: false,
    capabilities,
    setEditing: vi.fn(),
    onSubmit: vi.fn(),
    onRemove: vi.fn(),
    onComment: vi.fn(),
    onCloseActivity: vi.fn(),
    onReopenActivity: vi.fn(),
    runTaskBoardMutation: vi.fn(async () => "IGNORED" as const)
  });
}

const none: RecordModalCapabilities = {
  canWrite: false,
  canDelete: false,
  canComment: false,
  canAddMembers: false,
  canRemoveMembers: false
};

describe("ActivityDetail capability projection", () => {
  it("keeps read-only detail and its task board structurally immutable", () => {
    const tree = renderDetail(none);
    const taskBoard = elements(tree).find((element) => element.type === InternalTaskBoard);
    const text = textOf(tree);

    expect(text).not.toContain(messages["en-GB"].edit);
    expect(text).not.toContain(messages["en-GB"].delete);
    expect(text).not.toContain(messages["en-GB"].closeActivity);
    expect(text).not.toContain(messages["en-GB"].reopenActivity);
    expect(
      elements(tree).some(
        (element) =>
          element.type === "form" &&
          (element.props as { className?: string }).className === "comment-form"
      )
    ).toBe(false);
    expect(taskBoard?.props as { canWrite: boolean; canDelete: boolean }).toMatchObject({
      canWrite: false,
      canDelete: false
    });
  });

  it("does not derive delete or comment authority from activity write", () => {
    const tree = renderDetail({ ...none, canWrite: true });
    const taskBoard = elements(tree).find((element) => element.type === InternalTaskBoard);
    const text = textOf(tree);

    expect(text).toContain(messages["en-GB"].edit);
    expect(text).toContain(messages["en-GB"].closeActivity);
    expect(text).not.toContain(messages["en-GB"].delete);
    expect(
      elements(tree).some(
        (element) =>
          element.type === "form" &&
          (element.props as { className?: string }).className === "comment-form"
      )
    ).toBe(false);
    expect(taskBoard?.props as { canWrite: boolean; canDelete: boolean }).toMatchObject({
      canWrite: true,
      canDelete: false
    });
  });

  it("keeps delete and comment independently available without write authority", () => {
    const tree = renderDetail({ ...none, canDelete: true, canComment: true });
    const taskBoard = elements(tree).find((element) => element.type === InternalTaskBoard);
    const text = textOf(tree);

    expect(text).not.toContain(messages["en-GB"].edit);
    expect(text).toContain(messages["en-GB"].delete);
    expect(
      elements(tree).some(
        (element) =>
          element.type === "form" &&
          (element.props as { className?: string }).className === "comment-form"
      )
    ).toBe(true);
    expect(taskBoard?.props as { canWrite: boolean; canDelete: boolean }).toMatchObject({
      canWrite: false,
      canDelete: true
    });
  });

  it("names the comment field and its real submit control", () => {
    const tree = renderDetail({ ...none, canComment: true });
    const commentInput = elements(tree).find(
      (element) =>
        element.type === "input" &&
        (element.props as { "aria-label"?: string })["aria-label"] === messages["en-GB"].addComment
    );
    const commentButton = elements(tree).find(
      (element) =>
        element.type === "button" &&
        (element.props as { "aria-label"?: string })["aria-label"] === messages["en-GB"].addComment
    );
    const commentForm = elements(tree).find(
      (element) =>
        element.type === "form" &&
        (element.props as { className?: string }).className === "comment-form"
    );

    expect(commentInput?.props).toMatchObject({ name: "body", required: true });
    expect(commentButton?.props).toMatchObject({ type: "submit" });
    expect((commentForm?.props as { onSubmit?: unknown }).onSubmit).toEqual(expect.any(Function));
  });

  it("keeps activity enum values canonical while presenting localised labels", () => {
    const selects = elements(renderDetail({ ...none, canWrite: true })).filter(
      (element) => element.type === SelectInput
    );
    const priority = selects.find(
      (element) => (element.props as { name?: string }).name === "priority"
    );
    const status = selects.find(
      (element) => (element.props as { name?: string }).name === "status"
    );

    expect((priority?.props as { options?: string[][] }).options).toContainEqual([
      "CRITICAL",
      "Critical"
    ]);
    expect((status?.props as { options?: string[][] }).options).toContainEqual([
      "WAITING_CUSTOMER",
      "Waiting for customer"
    ]);
  });
});
