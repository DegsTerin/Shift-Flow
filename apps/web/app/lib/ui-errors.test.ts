// en-GB: Verifies independent error lanes always expose the most recently published failure.
import { describe, expect, it } from "vitest";
import { mostRecentUiError } from "./ui-errors";

describe("UI error arbitration", () => {
  it("selects the newest error regardless of lane or argument order", () => {
    const actionError = { order: 4, message: "action failed" };
    const dataError = { order: 9, message: "data failed" };
    const detailError = { order: 7, message: "detail failed" };

    expect(mostRecentUiError(detailError, dataError, actionError)).toBe(dataError);
    expect(mostRecentUiError(actionError, detailError, dataError)).toBe(dataError);
  });

  it("falls back to the newest remaining lane when another lane is cleared", () => {
    const actionError = { order: 4, message: "action failed" };
    const detailError = { order: 7, message: "detail failed" };

    expect(mostRecentUiError(actionError, null, detailError)).toBe(detailError);
    expect(mostRecentUiError(actionError, null, null)).toBe(actionError);
  });
});
