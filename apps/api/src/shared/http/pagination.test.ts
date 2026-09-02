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
    expect(toPagination({ page: undefined, pageSize: undefined })).toEqual({
      page: 1,
      pageSize: 25
    });
    expect(toSkipTake({ page: 3, pageSize: 10 })).toEqual({ skip: 20, take: 10 });
  });

  it("accepts decimal strings and internal integers at exact bounds", () => {
    expect(toPagination({ page: "10000", pageSize: "100" })).toEqual({
      page: 10_000,
      pageSize: 100
    });
    expect(toPagination({ page: 2, pageSize: 1 })).toEqual({ page: 2, pageSize: 1 });
  });

  it.each([
    { page: "0" },
    { page: "" },
    { page: "01" },
    { page: "1.5" },
    { page: "1e2" },
    { page: "0x10" },
    { page: "10001" },
    { page: String(Number.MAX_SAFE_INTEGER) },
    { page: true },
    { page: null },
    { page: ["2"] },
    { page: { value: "2" } },
    { pageSize: "0" },
    { pageSize: "101" },
    { pageSize: "not-a-number" },
    { pageSize: false },
    { pageSize: ["25", "50"] }
  ])("rejects invalid pagination as a bad request", (query) => {
    expect(() => toPagination(query)).toThrow(
      expect.objectContaining({ statusCode: 400, code: "BAD_REQUEST" })
    );
  });

  it("uses one strict search contract while preserving absence and trimming", () => {
    expect(toBoundedSearch({})).toBe("");
    expect(toBoundedSearch({ search: undefined })).toBe("");
    expect(toBoundedSearch({ search: "  needle  " })).toBe("needle");
    expect(toBoundedSearch({ search: "x".repeat(200) })).toHaveLength(200);
    expect(searchableListQuerySchema.safeParse({ search: "x".repeat(200) }).success).toBe(true);
  });

  it.each([
    true,
    42,
    null,
    ["needle"],
    { value: "needle" },
    "x".repeat(201)
  ])("rejects an invalid present search value", (search) => {
    expect(() => toBoundedSearch({ search })).toThrow(
      expect.objectContaining({ statusCode: 400, code: "BAD_REQUEST" })
    );
  });
});
