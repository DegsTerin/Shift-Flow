// en-GB: Verifies semantic selection state for reusable interface controls.
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { messages } from "../lib/i18n";
import { emptyFilters } from "../lib/utils";
import { FilterBar, SegmentedControl, SelectInput, withSelectedOption } from "./controls";

function elements(node: unknown): ReactElement[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const element = node as ReactElement;
  return [element, ...elements((element.props as { children?: unknown }).children)];
}

describe("SegmentedControl", () => {
  it("announces the selected option and emits one requested change", () => {
    const onChange = vi.fn();
    const tree = SegmentedControl({
      label: "Language",
      options: ["pt-BR", "en-GB"],
      value: "en-GB",
      onChange
    });
    const buttons = elements(tree).filter((element) => element.type === "button");

    expect(
      buttons.map((button) => (button.props as { "aria-pressed": boolean })["aria-pressed"])
    ).toEqual([false, true]);
    (buttons[0]?.props as { onClick: () => void }).onClick();
    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledWith("pt-BR");
  });
});

describe("SelectInput", () => {
  it("preserves a selected reference that is outside the loaded page", () => {
    const options = withSelectedOption([["first", "First"]], "current", "Current reference");
    const tree = SelectInput({ name: "referenceId", value: "current", options });
    const renderedOptions = elements(tree).filter((element) => element.type === "option");

    expect(renderedOptions.map((option) => option.props)).toEqual([
      expect.objectContaining({ value: "current", children: "Current reference" }),
      expect.objectContaining({ value: "first", children: "First" })
    ]);
  });

  it("does not duplicate an already loaded selected reference", () => {
    expect(withSelectedOption([["current", "Current"]], "current", "Fallback")).toEqual([
      ["current", "Current"]
    ]);
  });
});

describe("FilterBar date range", () => {
  it("renders visible labels for every compact remote reference filter", () => {
    const tree = FilterBar({
      t: messages["en-GB"],
      filters: emptyFilters,
      setFilters: vi.fn(),
      clients: [],
      teams: [],
      shifts: [],
      users: []
    });
    const referenceFields = elements(tree).filter(
      (element) =>
        element.type === "div" &&
        (element.props as { className?: string }).className === "reference-field"
    );

    expect(referenceFields).toHaveLength(4);
    expect(
      referenceFields.map(
        (field) =>
          (
            elements(field).find((element) => element.type === "span")?.props as {
              children?: unknown;
            }
          ).children
      )
    ).toEqual(["Client", "Team", "Shift", "Analyst"]);
  });

  it("exposes canonical bounds and an accessible error for an inverted range", () => {
    const tree = FilterBar({
      t: messages["en-GB"],
      filters: { ...emptyFilters, from: "2026-08-28", to: "2026-08-27" },
      setFilters: vi.fn(),
      clients: [],
      teams: [],
      shifts: [],
      users: []
    });
    const dateInputs = elements(tree).filter(
      (element) => element.type === "input" && (element.props as { type?: string }).type === "date"
    );
    const error = elements(tree).find(
      (element) => element.type === "p" && (element.props as { role?: string }).role === "alert"
    );

    expect(dateInputs).toHaveLength(2);
    expect(dateInputs[0]?.props).toMatchObject({
      max: "2026-08-27",
      "aria-invalid": true,
      "aria-describedby": "filter-date-range-error"
    });
    expect(dateInputs[1]?.props).toMatchObject({
      min: "2026-08-28",
      "aria-invalid": true,
      "aria-describedby": "filter-date-range-error"
    });
    expect((error?.props as { children?: unknown }).children).toBe(
      messages["en-GB"].invalidDateRange
    );
  });
});
