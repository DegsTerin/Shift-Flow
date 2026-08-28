// en-GB: Proves the public Render entry point keeps API and Web routing on one origin.
import { describe, expect, it } from "vitest";

import { isApiRequestPath } from "../infra/render/request-routing.mjs";

describe("Render same-origin request routing", () => {
  it.each(["/health", "/ready", "/api", "/api/auth/login", "/api/audit/record-id"])(
    "routes %s to the incumbent API",
    (pathname) => {
      expect(isApiRequestPath(pathname)).toBe(true);
    }
  );

  it.each(["/", "/dashboard", "/apiary", "/openapi/v1.json", "/health/details"])(
    "routes %s to the Web application",
    (pathname) => {
      expect(isApiRequestPath(pathname)).toBe(false);
    }
  );
});
