// en-GB: Verifies bounded pagination parsing and client-facing failures.
import { describe, expect, it } from "vitest";
import {
  searchableListQuerySchema,
  toBoundedSearch,
  toPagination,
  toSkipTake
} from "./pagination.js";

describe("pagination", () => {
  it("uses bounded defaults and derives the database window", () => {
    const pagination = toPagination({});

    expect(pagination).toEqual({ page: 1, pageSize: 25 });
    expect(toSkipTake({ page: 3, pageSize: 10 })).toEqual({ skip: 20, take: 10 });
  });

  it("accepts the maximum bounded page", () => {
    expect(toPagination({ page: "10000" })).toEqual({ page: 10_000, pageSize: 25 });
  });

  it.each([
    { page: "0" },
    { page: "1.5" },
    { page: "10001" },
    { page: String(Number.MAX_SAFE_INTEGER) },
    { pageSize: "0" },
    { pageSize: "101" },
    { pageSize: "not-a-number" }
  ])("rejects invalid pagination as a bad request", (query) => {
    expect(() => toPagination(query)).toThrow(
      expect.objectContaining({ statusCode: 400, code: "BAD_REQUEST" })
    );
  });

  it("bounds defensive search parsing and validates the public query contract", () => {
    expect(toBoundedSearch({ search: `  ${"x".repeat(220)}  ` })).toHaveLength(200);
    expect(toBoundedSearch({})).toBe("");
    expect(searchableListQuerySchema.safeParse({ search: "x".repeat(201) }).success).toBe(false);
  });
});
