// en-GB: Verifies notification-centre semantics and read controls without replacing the real API contract.
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { messages } from "../lib/i18n";
import type { NotificationItem } from "../lib/types";
import { formatNotificationDate, NotificationCentre } from "./notification-centre";

function elements(node: unknown): ReactElement[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const element = node as ReactElement;
  return [element, ...elements((element.props as { children?: unknown }).children)];
}

const notification: NotificationItem = {
  id: "notification-a",
  type: "SYSTEM",
  priority: "NORMAL",
  title: "Fixture ready",
  body: "The integration fixture is available.",
  readAt: null,
  createdAt: "2026-08-28T15:04:10.057Z"
};

function renderNotificationCentre(
  overrides: Partial<Parameters<typeof NotificationCentre>[0]> = {}
) {
  return NotificationCentre({
    t: messages["en-GB"],
    locale: "en-GB",
    open: true,
    unread: 1,
    items: [notification],
    loading: false,
    error: null,
    canMarkRead: true,
    pendingId: null,
    onToggle: vi.fn(),
    onClose: vi.fn(),
    onMarkRead: vi.fn(),
    onMarkAllRead: vi.fn(),
    ...overrides
  });
}

describe("NotificationCentre", () => {
  it("renders a real disclosure button and an accessible notification dialog", () => {
    const tree = renderNotificationCentre();
    const button = elements(tree).find(
      (element) =>
        element.type === "button" && "aria-expanded" in (element.props as Record<string, unknown>)
    );
    const dialog = elements(tree).find(
      (element) =>
        element.type === "section" && (element.props as { role?: string }).role === "dialog"
    );

    expect(button?.props).toMatchObject({
      "aria-expanded": true,
      "aria-haspopup": "dialog",
      "aria-label": "Notifications: 1 unread"
    });
    expect(dialog?.props).toMatchObject({
      "aria-labelledby": "notification-centre-title",
      id: "notification-centre-panel"
    });
  });

  it("emits one individual and one bulk read request from explicit controls", () => {
    const onMarkRead = vi.fn();
    const onMarkAllRead = vi.fn();
    const tree = renderNotificationCentre({ onMarkRead, onMarkAllRead });
    const buttons = elements(tree).filter((element) => element.type === "button");
    const markAll = buttons.find((button) =>
      String((button.props as { children?: unknown }).children).includes("Mark all as read")
    );
    const markOne = buttons.find(
      (button) =>
        (button.props as { "aria-label"?: string })["aria-label"] === "Mark as read: Fixture ready"
    );

    (markAll?.props as { onClick: () => void }).onClick();
    (markOne?.props as { onClick: () => void }).onClick();

    expect(onMarkAllRead).toHaveBeenCalledOnce();
    expect(onMarkRead).toHaveBeenCalledOnce();
    expect(onMarkRead).toHaveBeenCalledWith("notification-a");
  });

  it("closes on Escape and preserves invalid timestamps as factual text", () => {
    const onClose = vi.fn();
    const tree = renderNotificationCentre({ onClose });
    const root = elements(tree).find(
      (element) =>
        element.type === "div" &&
        (element.props as { className?: string }).className === "notification-centre"
    );
    const preventDefault = vi.fn();

    (root?.props as { onKeyDown: (event: unknown) => void }).onKeyDown({
      key: "Escape",
      preventDefault
    });

    expect(preventDefault).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
    expect(formatNotificationDate("not-a-date", "en-GB")).toBe("not-a-date");
  });
});
