// en-GB: Exercises list pagination through the real component so server pages are not repaginated locally.
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("react", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    useMemo: (factory: () => unknown) => factory(),
    useState: (initial: unknown) => [initial, vi.fn()]
  };
});

import { messages } from "../lib/i18n";
import { ActivityList, ManagementTable, shiftCells, tablePageSize, TeamsView } from "./lists";

function childElements(node: unknown): ReactElement[] {
  if (Array.isArray(node)) return node.flatMap(childElements);
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const element = node as ReactElement;
  const children =
    typeof element.type === "function"
      ? (element.type as (props: unknown) => unknown)(element.props)
      : (element.props as { children?: unknown }).children;
  return [element, ...childElements(children)];
}

function textOf(node: unknown): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join(" ");
  if (!node || typeof node !== "object" || !("props" in node)) return "";
  const element = node as ReactElement;
  return textOf(
    typeof element.type === "function"
      ? (element.type as (props: unknown) => unknown)(element.props)
      : (element.props as { children?: unknown }).children
  );
}

describe("Shift period cells", () => {
  it("shows complete dates and the stored zone across a local date boundary", () => {
    const cells = shiftCells("en-GB")({
      name: "Night",
      startsAt: "2026-08-30T01:00:00Z",
      endsAt: "2026-08-30T09:00:00Z",
      timezone: "America/Sao_Paulo",
      status: "OPEN"
    });
    expect(cells).toEqual([
      "Night",
      "29/08/2026, 22:00 (America/Sao_Paulo)",
      "30/08/2026, 06:00 (America/Sao_Paulo)",
      "OPEN"
    ]);
  });

  it("does not replace missing or invalid Shift zones with the browser zone", () => {
    expect(shiftCells("en-GB")({ startsAt: "2026-08-30T01:00:00Z" })[1]).toBe("-");
    expect(
      shiftCells("en-GB")({ startsAt: "2026-08-30T01:00:00Z", timezone: "Invalid/Zone" })[1]
    ).toBe("-");
  });
});

describe("ActivityList server pagination", () => {
  it("renders the server page and requests adjacent server pages", () => {
    const onPage = vi.fn();
    const activities = Array.from({ length: tablePageSize }, (_, index) => ({
      id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      title: `Activity ${index}`,
      updatedAt: "2026-08-27T12:00:00.000Z"
    }));
    const tree = ActivityList({
      t: messages["en-GB"],
      activities,
      pagination: { page: 2, pageSize: tablePageSize, total: 30, onPage },
      onNew: vi.fn(),
      onOpen: vi.fn()
    });
    const elements = childElements(tree);
    const recordLinks = elements.filter(
      (element) =>
        element.type === "button" &&
        (element.props as { className?: string }).className === "record-link" &&
        typeof (element.props as { onClick?: unknown }).onClick === "function"
    );
    const previous = elements.find(
      (element) => element.type === "button" && textOf(element) === messages["en-GB"].previous
    );
    const next = elements.find(
      (element) => element.type === "button" && textOf(element) === messages["en-GB"].next
    );

    expect(recordLinks).toHaveLength(tablePageSize);
    expect(textOf(tree).replace(/\s+/g, " ").trim()).toContain("Page 2 of 3 - 30 records");
    expect(
      elements.some(
        (element) =>
          element.type === "button" && textOf(element).trim() === messages["en-GB"].updated
      )
    ).toBe(false);
    (previous?.props as { onClick?: () => void }).onClick?.();
    (next?.props as { onClick?: () => void }).onClick?.();
    expect(onPage.mock.calls).toEqual([[1], [3]]);
  });

  it("preserves server order and opens the exact first record through a semantic control", () => {
    const onOpen = vi.fn();
    const first = {
      id: "ffffffff-0000-4000-8000-000000000001",
      title: "First from server",
      updatedAt: "2026-08-20T12:00:00.000Z"
    };
    const second = {
      id: "00000000-0000-4000-8000-000000000002",
      title: "Second from server",
      updatedAt: "2026-08-27T12:00:00.000Z"
    };
    const tree = ActivityList({
      t: messages["en-GB"],
      activities: [first, second],
      pagination: { page: 1, pageSize: tablePageSize, total: 2, onPage: vi.fn() },
      onOpen
    });
    const recordLinks = childElements(tree).filter(
      (element) =>
        element.type === "button" &&
        (element.props as { className?: string }).className === "record-link"
    );

    expect(recordLinks.map(textOf)).toEqual(["ffffffff", "00000000"]);
    (recordLinks[0]?.props as { onClick?: () => void }).onClick?.();
    expect(onOpen).toHaveBeenCalledOnce();
    expect(onOpen).toHaveBeenCalledWith(first);
  });

  it("renders record identity as non-interactive text when detail access is unavailable", () => {
    const tree = ActivityList({
      t: messages["en-GB"],
      activities: [
        {
          id: "ffffffff-0000-4000-8000-000000000001",
          title: "Read-only dashboard item",
          updatedAt: "2026-08-27T12:00:00.000Z"
        }
      ]
    });
    const recordLinks = childElements(tree).filter(
      (element) =>
        element.type === "button" &&
        (element.props as { className?: string }).className === "record-link"
    );

    expect(recordLinks).toHaveLength(0);
    expect(textOf(tree)).toContain("ffffffff");
  });

  it("renders activity priority and status labels in the active locale", () => {
    const tree = ActivityList({
      t: messages["pt-BR"],
      activities: [
        {
          id: "activity-localised",
          title: "Localised activity",
          priority: "CRITICAL",
          status: "WAITING_CUSTOMER",
          updatedAt: "2026-08-27T12:00:00.000Z"
        }
      ]
    });
    const text = textOf(tree);

    expect(text).toContain("Crítica");
    expect(text).toContain("Aguardando cliente");
    expect(text).not.toContain("CRITICAL");
    expect(text).not.toContain("WAITING_CUSTOMER");
  });

  it("renders create only when authorised across list variants", () => {
    const onNew = vi.fn();
    const withoutCreate = ActivityList({
      t: messages["en-GB"],
      activities: [],
      onOpen: vi.fn()
    });
    const withCreate = ActivityList({
      t: messages["en-GB"],
      activities: [],
      onNew,
      onOpen: vi.fn()
    });
    const management = ManagementTable({
      title: "Users",
      rows: [{ id: "user-a", name: "User A" }],
      columns: ["Name"],
      cells: (row) => [row.name],
      t: messages["en-GB"],
      onOpen: vi.fn()
    });
    const teams = TeamsView({
      t: messages["en-GB"],
      teams: [{ id: "team-a", name: "Team A" }],
      onOpen: vi.fn()
    });

    expect(textOf(withoutCreate)).not.toContain(messages["en-GB"].newRecord);
    const create = childElements(withCreate).find(
      (element) =>
        element.type === "button" && textOf(element).includes(messages["en-GB"].newRecord)
    );
    (create?.props as { onClick?: () => void }).onClick?.();
    expect(onNew).toHaveBeenCalledOnce();
    for (const tree of [management, teams]) {
      const link = childElements(tree).find(
        (element) =>
          element.type === "button" &&
          (element.props as { className?: string }).className === "record-link"
      );
      expect(link).toBeDefined();
    }
  });
});
