// en-GB: Verifies that UUID path parameters fail before reaching persistence.
import { describe, expect, it } from "vitest";
import { uuidParam } from "./params.js";

describe("uuidParam", () => {
  it("returns a valid UUID", () => {
    expect(uuidParam("c40e2a7b-72a8-4aca-a780-d6d239134d38", "id")).toBe(
      "c40e2a7b-72a8-4aca-a780-d6d239134d38"
    );
  });

  it.each([undefined, ["one", "two"]])("rejects a missing or repeated value", (value) => {
    expect(() => uuidParam(value, "id")).toThrow("id parameter is required");
  });

  it("rejects a malformed UUID", () => {
    expect(() => uuidParam("not-a-uuid", "taskId")).toThrow(
      "taskId parameter must be a valid UUID"
    );
  });
});
