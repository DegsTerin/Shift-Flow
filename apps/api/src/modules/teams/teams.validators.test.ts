// en-GB: Verifies that team memberships cannot end before they begin.
import { describe, expect, it } from "vitest";
import { teamMemberSchema } from "./teams.validators.js";

describe("teamMemberSchema", () => {
  it("accepts the membership payload emitted by the web application", () => {
    expect(
      teamMemberSchema.parse({
        userId: "c40e2a7b-72a8-4aca-a780-d6d239134d38",
        role: "LEADER"
      })
    ).toEqual({
      userId: "c40e2a7b-72a8-4aca-a780-d6d239134d38",
      role: "LEADER"
    });
  });

  it("rejects an inverted membership interval", () => {
    expect(
      teamMemberSchema.safeParse({
        userId: "c40e2a7b-72a8-4aca-a780-d6d239134d38",
        startsAt: "2026-08-28T00:00:00.000Z",
        endsAt: "2026-08-27T00:00:00.000Z"
      }).success
    ).toBe(false);
  });

  it("rejects endsAt without the startsAt value used for comparison", () => {
    expect(
      teamMemberSchema.safeParse({
        userId: "c40e2a7b-72a8-4aca-a780-d6d239134d38",
        endsAt: "2026-08-27T00:00:00.000Z"
      }).success
    ).toBe(false);
  });
});
