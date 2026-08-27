// en-GB: Verifies that API envelopes remain JSON-safe and never expose credential material.
import { describe, expect, it } from "vitest";
import { created, ok } from "./response.js";

describe("response envelopes", () => {
  it("converts bigint values recursively in data and metadata", () => {
    const response = ok(
      {
        byteSize: 1024n,
        nested: [{ count: 3n }],
        createdAt: new Date("2026-08-27T12:00:00.000Z")
      },
      { totalBytes: 2048n, refreshToken: "private" }
    );

    expect(response).toEqual({
      data: {
        byteSize: "1024",
        nested: [{ count: "3" }],
        createdAt: new Date("2026-08-27T12:00:00.000Z")
      },
      meta: { totalBytes: "2048", refreshToken: undefined }
    });
    expect(() => JSON.stringify(response)).not.toThrow();
  });

  it("redacts sensitive fields while preserving safe siblings", () => {
    expect(
      created({
        id: "record-1",
        passwordHash: "private",
        nested: { refreshToken: "private", label: "visible" }
      })
    ).toEqual({
      data: {
        id: "record-1",
        passwordHash: undefined,
        nested: { refreshToken: undefined, label: "visible" }
      }
    });
  });
});
