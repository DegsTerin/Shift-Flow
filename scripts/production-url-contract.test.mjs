// en-GB: Guards the production URL contract against split-host, insecure and non-origin configurations.
import { describe, expect, it } from "vitest";
import { validateProductionUrlContract } from "./production-url-contract.mjs";

describe("production URL contract", () => {
  it("accepts HTTPS origins on the same hostname with different ports", () => {
    expect(() =>
      validateProductionUrlContract(
        "https://shiftflow.example:7443,https://shiftflow.example:8443",
        "https://shiftflow.example:9443"
      )
    ).not.toThrow();
  });

  it.each([
    ["split host", "https://app.shiftflow.example", "https://api.shiftflow.example"],
    ["insecure Web", "http://shiftflow.example", "https://shiftflow.example"],
    ["insecure API", "https://shiftflow.example", "http://shiftflow.example"],
    ["trailing slash", "https://shiftflow.example/", "https://shiftflow.example"],
    ["path", "https://shiftflow.example/app", "https://shiftflow.example"],
    ["query", "https://shiftflow.example?source=web", "https://shiftflow.example"],
    ["fragment", "https://shiftflow.example#app", "https://shiftflow.example"],
    ["credentials", "https://user@shiftflow.example", "https://shiftflow.example"]
  ])("rejects %s configuration", (_label, corsOrigin, apiBaseUrl) => {
    expect(() => validateProductionUrlContract(corsOrigin, apiBaseUrl)).toThrow();
  });
});
