// en-GB: Verifies that structured logging remains bounded, useful and safe under hostile input.
import { Buffer } from "node:buffer";
import { runInNewContext } from "node:vm";
import { afterEach, describe, expect, it, vi } from "vitest";

const mockedEnv = vi.hoisted(() => ({
  LOG_LEVEL: "debug",
  NODE_ENV: "test"
}));

vi.mock("../config/env.js", () => ({ env: mockedEnv }));

import { logger } from "./logger.js";

function parseLastLine(calls: readonly (readonly unknown[])[]) {
  const value = calls.at(-1)?.[0];
  expect(typeof value).toBe("string");
  return JSON.parse(String(value)) as Record<string, unknown>;
}

afterEach(() => {
  mockedEnv.NODE_ENV = "test";
  vi.restoreAllMocks();
});

describe("logger", () => {
  it("preserves the public sinks and protects the core envelope from field overrides", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    logger.debug("debug_message", { safe: true });
    logger.info("info_message");
    logger.warn("warn_message", {
      timestamp: "forged",
      level: "error",
      service: "forged-service",
      message: "forged-message"
    });
    logger.error("error_message");

    expect(info).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledTimes(1);

    const payload = parseLastLine(warn.mock.calls);
    expect(payload).toMatchObject({
      level: "warn",
      service: "shiftflow-api",
      message: "warn_message"
    });
    expect(payload.timestamp).not.toBe("forged");
    expect(payload.timestamp).toEqual(expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/));
  });

  it("redacts sensitive keys regardless of case or separators across objects, arrays and Headers", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const headers = new Headers({
      Authorization: "Bearer header-secret",
      Cookie: "sid=cookie-secret",
      "X-Request-Id": "request-safe"
    });

    logger.info("sensitive_keys", {
      "API-KEY": "api-key-secret",
      auth: "opaque-auth-value",
      session: "opaque-session-value",
      csrf: "opaque-csrf-value",
      xsrf: "opaque-xsrf-value",
      authStatus: "enabled",
      refresh_token: "refresh-secret",
      nested: {
        "Client.Secret": "client-secret",
        safeTokenCount: 7
      },
      rows: [{ PASSWORD: "password-secret", label: "safe-label" }],
      headers
    });

    const line = String(info.mock.calls[0]?.[0]);
    const payload = JSON.parse(line) as Record<string, unknown>;

    expect(line).not.toMatch(
      /api-key-secret|opaque-auth-value|opaque-session-value|opaque-csrf-value|opaque-xsrf-value|refresh-secret|client-secret|password-secret/
    );
    expect(line).not.toMatch(/header-secret|cookie-secret/);
    expect(payload["API-KEY"]).toBe("[REDACTED]");
    expect(payload).toMatchObject({
      auth: "[REDACTED]",
      session: "[REDACTED]",
      csrf: "[REDACTED]",
      xsrf: "[REDACTED]",
      authStatus: "enabled",
      nested: { safeTokenCount: 7 },
      rows: [{ PASSWORD: "[REDACTED]", label: "safe-label" }],
      headers: {
        authorization: "[REDACTED]",
        cookie: "[REDACTED]",
        "x-request-id": "request-safe"
      }
    });
  });

  it("redacts credential patterns embedded in otherwise untrusted text values", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyIn0.signature-secret";
    const compactJwt = "eyJhbGciOiJIUzI1NiJ9.e30.compact-signature-secret";
    const privateKeyHeader = ["-----BEGIN", "PRIVATE KEY-----"].join(" ");
    const privateKeyFooter = ["-----END", "PRIVATE KEY-----"].join(" ");
    const privateKey = [privateKeyHeader, "pem-secret", privateKeyFooter].join("\n");

    logger.info("value_patterns", {
      auth: "Bearer bearer-secret and Basic YmFzaWMtc2VjcmV0",
      jwtValue: jwt,
      compactJwtValue: compactJwt,
      ordinaryDottedValue: "example.domain.identifier",
      uri: "postgresql://db-user:db-pass@db.local/app?token=query-secret&safe=visible",
      doubleEncodedUri:
        "https://client.example/callback?%2561ccess_token=double-encoded-secret&safe=visible",
      fragmentUri: "https://client.example/callback#access_token=fragment-secret&token_type=Bearer",
      cookieText: "Cookie: sid=cookie-value; theme=dark",
      setCookieText: "Set-Cookie: auth=auth-cookie-value; Path=/; Secure",
      privateMaterial: privateKey
    });

    const line = String(info.mock.calls[0]?.[0]);
    const payload = JSON.parse(line) as Record<string, unknown>;

    expect(line).not.toMatch(
      /bearer-secret|YmFzaWMtc2VjcmV0|signature-secret|compact-signature-secret|db-user|db-pass|query-secret|double-encoded-secret|fragment-secret|cookie-value|auth-cookie-value|pem-secret/
    );
    expect(line).toContain("[REDACTED]");
    expect(payload.ordinaryDottedValue).toBe("example.domain.identifier");
    expect(payload.uri).toContain("safe=visible");
    expect(payload.doubleEncodedUri).toContain("safe=visible");
    expect(payload.fragmentUri).toContain("token_type=Bearer");
    expect(payload.cookieText).toBe("Cookie: [REDACTED]");
    expect(payload.setCookieText).toBe("Set-Cookie: [REDACTED]");
  });

  it("redacts bounded sensitive assignments in messages, JSON and semicolon text", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    logger.warn("Password=message-secret; safe=visible", {
      assignments:
        "Passwd:passwd-secret; secret=plain-secret; API-key=api-secret; client secret='client secret value'; credential=credential-secret; openai_api_key=provider-key; github-token=provider-token; aws_access_key_id=aws-provider-key; token_count=5; token_expires_at=2026-09-02T12:00:00Z",
      json: '{"password":"json-secret","safe":"visible"}',
      oauthForm:
        "code=oauth-code-secret&code_verifier=pkce-secret&auth_code=auth-code-secret&authorization_code=authorisation-code-secret&pkce=raw-pkce-secret&statusCode=200&errorCode=E_SAFE",
      underscoreAssignments:
        '_csrf=csrf-secret; _xsrf=xsrf-secret; {"__RequestVerificationToken":"verification-token-secret","safe":"visible"}'
    });

    const line = String(warn.mock.calls[0]?.[0]);
    expect(line).not.toMatch(
      /message-secret|passwd-secret|plain-secret|api-secret|client secret value|credential-secret|provider-key|provider-token|aws-provider-key|json-secret|oauth-code-secret|pkce-secret|auth-code-secret|authorisation-code-secret|raw-pkce-secret|csrf-secret|xsrf-secret|verification-token-secret/
    );
    expect(line).toContain("safe=visible");
    expect(line).toContain("token_count=5");
    expect(line).toContain("token_expires_at=2026-09-02T12:00:00Z");
    expect(line).toContain("statusCode=200&errorCode=E_SAFE");
  });

  it("redacts complete labelled credentials while preserving explicitly delimited fields", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    logger.warn(
      "Authorization: Bearer labelled-bearer-secret secondary-secret, request_id=request-safe",
      {
        diagnosticA: "Password: correct horse battery staple; safe=visible",
        diagnosticB:
          "Proxy-Authorization: Basic bGFiZWxsZWQtYmFzaWMtc2VjcmV0 secondary-basic-secret; trace=trace-safe",
        diagnosticC: "API-Key: api key with spaces, region=eu-west-1",
        diagnosticD:
          'Authorization: Digest username="digest-user", realm="digest-realm", nonce="digest-nonce-secret", response="digest-response-secret"',
        diagnosticE:
          'Proxy-Authorization: Digest username="proxy-user", nonce="proxy-nonce-secret", response="proxy-response-secret"',
        diagnosticF:
          "Bearer unlabelled-primary-secret unlabelled-secondary-secret, request_id=request-safe"
      }
    );

    const line = String(warn.mock.calls[0]?.[0]);
    const payload = JSON.parse(line) as Record<string, string>;
    expect(line).not.toMatch(
      /labelled-bearer-secret|secondary-secret|correct horse battery staple|bGFiZWxsZWQtYmFzaWMtc2VjcmV0|secondary-basic-secret|api key with spaces|digest-user|digest-realm|digest-nonce-secret|digest-response-secret|proxy-user|proxy-nonce-secret|proxy-response-secret|unlabelled-primary-secret|unlabelled-secondary-secret/
    );
    expect(payload.message).toBe("Authorization: [REDACTED], request_id=request-safe");
    expect(payload.diagnosticA).toBe("Password: [REDACTED]; safe=visible");
    expect(payload.diagnosticB).toBe("Proxy-Authorization: [REDACTED]; trace=trace-safe");
    expect(payload.diagnosticC).toBe("API-Key: [REDACTED], region=eu-west-1");
    expect(payload.diagnosticD).toBe("Authorization: [REDACTED]");
    expect(payload.diagnosticE).toBe("Proxy-Authorization: [REDACTED]");
    expect(payload.diagnosticF).toBe("Bearer [REDACTED], request_id=request-safe");
  });

  it("keeps representative redacted text stable when it is sanitised again", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);

    logger.info("idempotence_first", {
      diagnosticA: "Authorization: Bearer idempotent-auth-secret, request_id=request-safe",
      diagnosticB: "Password: idempotent secret phrase; safe=visible",
      diagnosticC:
        "https://client.example/callback#access_token=idempotent-fragment-secret&state=state-safe",
      diagnosticD: "Cookie: sid=idempotent-cookie-secret; theme=dark"
    });
    const first = parseLastLine(info.mock.calls) as Record<string, string>;

    logger.info("idempotence_second", {
      diagnosticA: first.diagnosticA,
      diagnosticB: first.diagnosticB,
      diagnosticC: first.diagnosticC,
      diagnosticD: first.diagnosticD
    });
    const second = parseLastLine(info.mock.calls) as Record<string, string>;

    expect({
      diagnosticA: second.diagnosticA,
      diagnosticB: second.diagnosticB,
      diagnosticC: second.diagnosticC,
      diagnosticD: second.diagnosticD
    }).toEqual({
      diagnosticA: first.diagnosticA,
      diagnosticB: first.diagnosticB,
      diagnosticC: first.diagnosticC,
      diagnosticD: first.diagnosticD
    });
  });

  it("redacts unlabelled cookie values without treating safe token metadata as a cookie", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);

    logger.info("cookie_classification", {
      cookiePair: "sid=cookie-secret; theme=dark; Path=/; HttpOnly",
      orderedCookiePair: "theme=dark; connect.sid=connect-session-secret; locale=en-GB",
      metrics:
        "token_count=5; path=/jobs; status=ok; token_expires_at=2026-09-02T12:00:00Z; safe=visible"
    });

    const line = String(info.mock.calls[0]?.[0]);
    const payload = JSON.parse(line) as Record<string, string>;
    expect(line).not.toContain("cookie-secret");
    expect(payload.cookiePair).toBe("sid=[REDACTED]; theme=[REDACTED]; Path=/; HttpOnly");
    expect(payload.orderedCookiePair).toBe("theme=dark; connect.sid=[REDACTED]; locale=en-GB");
    expect(payload.metrics).toBe(
      "token_count=5; path=/jobs; status=ok; token_expires_at=2026-09-02T12:00:00Z; safe=visible"
    );
  });

  it("normalises Error details recursively and omits stacks only in production", () => {
    const errorSink = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const cause = new Error("cause Password=cause-secret");
    const failure = new TypeError("request Password=message-secret", {
      cause
    }) as TypeError & { safeContext: string };
    failure.stack = "TypeError: Password=stack-secret\n    at safe-location";
    failure.safeContext = "operation-safe";
    Object.defineProperty(failure, "api_key", {
      enumerable: true,
      value: "custom-error-secret"
    });

    logger.error("application_error", { error: failure });

    const developmentLine = String(errorSink.mock.calls[0]?.[0]);
    const developmentPayload = JSON.parse(developmentLine) as {
      error: Record<string, unknown>;
    };

    expect(developmentLine).not.toMatch(
      /cause-secret|message-secret|stack-secret|custom-error-secret/
    );
    expect(developmentPayload.error).toMatchObject({
      name: "TypeError",
      safeContext: "operation-safe",
      api_key: "[REDACTED]"
    });
    expect(developmentPayload.error.cause).toMatchObject({ name: "Error" });
    expect(developmentPayload.error).toHaveProperty("stack");

    mockedEnv.NODE_ENV = "production";
    logger.error("application_error", { error: failure });

    const productionPayload = JSON.parse(String(errorSink.mock.calls[1]?.[0])) as {
      error: Record<string, unknown>;
    };
    expect(productionPayload.error).not.toHaveProperty("stack");
  });

  it("normalises cross-realm errors and omits every own stack descriptor in production", () => {
    const errorSink = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const nameGetter = vi.fn(() => {
      throw new Error("name-getter-secret");
    });
    const toJSON = vi.fn(() => {
      throw new Error("tojson-secret");
    });
    const stackGetter = vi.fn(() => {
      throw new Error("stack-getter-secret");
    });
    mockedEnv.NODE_ENV = "production";
    const crossRealmError = runInNewContext(
      `
      (() => {
        const cause = new RangeError("cause Password=cross-cause-secret");
        const failure = new TypeError("message Password=cross-message-secret", { cause });
        failure.safeContext = "cross-realm-safe";
        failure.stackTrace = "Password=cross-stacktrace-secret";
        failure.errorStack = "Password=cross-errorstack-secret";
        failure.rawStack = "Password=cross-rawstack-secret";
        failure.callStack = "Password=cross-callstack-secret";
        failure.toJSON = toJSON;
        Object.defineProperty(cause, "stack", { enumerable: true, get: stackGetter });
        Object.defineProperty(failure, "stack", { enumerable: true, get: stackGetter });
        Object.defineProperty(failure, "name", { enumerable: true, get: nameGetter });
        return failure;
      })()
    `,
      { nameGetter, stackGetter, toJSON }
    ) as unknown;

    logger.error("cross_realm_error", {
      error: crossRealmError,
      diagnostic: {
        stack: "Password=plain-stack-secret",
        stackTrace: "Password=plain-stacktrace-secret",
        stack_trace: "Password=plain-stack-trace-secret",
        errorStack: "Password=plain-error-stack-secret",
        rawStack: "Password=plain-raw-stack-secret",
        callStack: "Password=plain-call-stack-secret",
        stackString: "Password=plain-stack-string-secret",
        exceptionStack: "Password=plain-exception-stack-secret",
        safe: "plain-safe"
      }
    });

    const line = String(errorSink.mock.calls[0]?.[0]);
    const payload = JSON.parse(line) as {
      error: Record<string, unknown>;
      diagnostic: Record<string, unknown>;
    };
    expect(line).not.toMatch(
      /cross-cause-secret|cross-message-secret|cross-stacktrace-secret|cross-errorstack-secret|cross-rawstack-secret|cross-callstack-secret|plain-stack-secret|plain-stacktrace-secret|plain-stack-trace-secret|plain-error-stack-secret|plain-raw-stack-secret|plain-call-stack-secret|plain-stack-string-secret|plain-exception-stack-secret|name-getter-secret|stack-getter-secret|tojson-secret/
    );
    expect(payload.error).toMatchObject({
      name: "TypeError",
      safeContext: "cross-realm-safe",
      cause: { name: "RangeError" },
      toJSON: "[Function]"
    });
    expect(payload.error).not.toHaveProperty("stack");
    expect(payload.error).not.toHaveProperty("stackTrace");
    expect(payload.error).not.toHaveProperty("errorStack");
    expect(payload.error).not.toHaveProperty("rawStack");
    expect(payload.error).not.toHaveProperty("callStack");
    expect(payload.diagnostic).toEqual({ safe: "plain-safe" });
    expect(nameGetter).not.toHaveBeenCalled();
    expect(stackGetter).not.toHaveBeenCalled();
    expect(toJSON).not.toHaveBeenCalled();
  });

  it("does not invoke getters or toJSON and contains hostile object and sink failures", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const getter = vi.fn(() => {
      throw new Error("getter-secret");
    });
    const toJSON = vi.fn(() => {
      throw new Error("tojson-secret");
    });
    const fields = Object.create(null) as Record<string, unknown>;
    Object.defineProperty(fields, "safe", { enumerable: true, value: "kept" });
    Object.defineProperty(fields, "trap", { enumerable: true, get: getter });
    Object.defineProperty(fields, "toJSON", { enumerable: true, value: toJSON });
    const hostileProxy = new Proxy(
      {},
      {
        ownKeys() {
          throw new Error("proxy-secret");
        }
      }
    );
    fields.hostileProxy = hostileProxy;

    expect(() => logger.info("hostile_fields", fields)).not.toThrow();

    const line = String(info.mock.calls[0]?.[0]);
    const payload = JSON.parse(line) as Record<string, unknown>;
    expect(getter).not.toHaveBeenCalled();
    expect(toJSON).not.toHaveBeenCalled();
    expect(payload).toMatchObject({
      safe: "kept",
      trap: "[Accessor omitted]",
      toJSON: "[Function]",
      hostileProxy: "[Unreadable object]"
    });
    expect(line).not.toMatch(/getter-secret|tojson-secret|proxy-secret/);

    info.mockImplementation(() => {
      throw new Error("sink failed");
    });
    expect(() => logger.info("sink_failure", { safe: true })).not.toThrow();
  });

  it("omits non-enumerable generic and custom Error properties", () => {
    const errorSink = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const context = { visible: "context-safe" } as Record<string, unknown>;
    Object.defineProperty(context, "rawInternal", {
      value: "opaque-hidden-context-value"
    });
    const failure = new Error("failure-safe") as Error & { visibleContext: string };
    failure.visibleContext = "error-context-safe";
    Object.defineProperty(failure, "rawInternal", {
      value: "opaque-hidden-error-value"
    });

    logger.error("hidden_properties", { context, error: failure });

    const line = String(errorSink.mock.calls[0]?.[0]);
    const payload = JSON.parse(line) as {
      context: Record<string, unknown>;
      error: Record<string, unknown>;
    };
    expect(line).not.toMatch(/opaque-hidden-context-value|opaque-hidden-error-value/);
    expect(payload.context).toEqual({ visible: "context-safe" });
    expect(payload.error).toMatchObject({
      name: "Error",
      message: "failure-safe",
      visibleContext: "error-context-safe"
    });
    expect(payload.error).not.toHaveProperty("rawInternal");
  });

  it("handles cycles, shared references, BigInt, Date and invalid Date values", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const shared = { label: "shared-safe" };
    type CircularFields = {
      self?: CircularFields;
      left: typeof shared;
      right: typeof shared;
      count: bigint;
      createdAt: Date;
      invalidAt: Date;
    };
    const fields: CircularFields = {
      left: shared,
      right: shared,
      count: 9_007_199_254_740_993n,
      createdAt: new Date("2026-09-02T12:00:00.000Z"),
      invalidAt: new Date(Number.NaN)
    };
    fields.self = fields;

    expect(() => logger.info("complex_values", fields)).not.toThrow();

    const payload = parseLastLine(info.mock.calls);
    expect(payload).toMatchObject({
      self: "[Circular reference]",
      left: { label: "shared-safe" },
      right: { label: "shared-safe" },
      count: "9007199254740993n",
      createdAt: "2026-09-02T12:00:00.000Z",
      invalidAt: "[Invalid Date]"
    });
  });

  it("retains AggregateError children through the recursive sanitiser", () => {
    const errorSink = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const failure = new AggregateError(
      [new Error("Password=aggregate-child-secret"), { api_key: "aggregate-key-secret" }],
      "aggregate-safe"
    );

    logger.error("aggregate_error", { error: failure });

    const line = String(errorSink.mock.calls[0]?.[0]);
    const payload = JSON.parse(line) as { error: Record<string, unknown> };
    expect(line).not.toMatch(/aggregate-child-secret|aggregate-key-secret/);
    expect(payload.error).toMatchObject({
      name: "AggregateError",
      message: "aggregate-safe",
      errors: [{ name: "Error" }, { api_key: "[REDACTED]" }]
    });
  });

  it("applies deterministic depth, key, array and string limits", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const deep: Record<string, unknown> = {};
    let cursor = deep;
    for (let index = 0; index < 12; index += 1) {
      const next: Record<string, unknown> = {};
      cursor.next = next;
      cursor = next;
    }

    const manyKeys = Object.fromEntries(
      Array.from({ length: 100 }, (_value, index) => [`safe_${index}`, index])
    );

    logger.info("bounded_values", {
      deep,
      manyKeys,
      manyItems: Array.from({ length: 100 }, (_value, index) => index),
      longText: "x".repeat(100_000),
      boundaryJwt: `${"x".repeat(4_060)} eyJhbGciOiJIUzI1NiJ9.payloadsegment.signature-beyond-boundary`,
      boundaryUri: `${"x".repeat(4_060)} postgresql://boundary-user:boundary-password@db.local/app`,
      boundaryAssignment: `${"x".repeat(4_060)} Password=boundary-assignment-secret-beyond-boundary`
    });

    const line = String(info.mock.calls[0]?.[0]);
    const payload = JSON.parse(line) as Record<string, unknown>;
    const serialisedPayload = JSON.stringify(payload);

    expect(line.length).toBeLessThanOrEqual(32_768);
    expect(serialisedPayload).toContain("[Depth limit reached]");
    expect(serialisedPayload).toContain("properties omitted");
    expect(serialisedPayload).toContain("array items omitted");
    expect(serialisedPayload).toContain("[truncated]");
    expect(serialisedPayload).not.toMatch(
      /eyJhbGciOiJIUzI1NiJ9|boundary-user|boundary-password|boundary-assignment/
    );
  });

  it("enforces one traversal budget across a wide object graph", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const forest = Array.from({ length: 16 }, (_branch, branch) =>
      Object.fromEntries(
        Array.from({ length: 40 }, (_value, index) => [`value_${index}`, branch * 100 + index])
      )
    );

    logger.info("bounded_traversal", { forest });

    const line = String(info.mock.calls[0]?.[0]);
    expect(line).toContain("[Traversal limit reached]");
    expect(line.length).toBeLessThanOrEqual(32_768);
  });

  it("reads only the retained descriptors from a dense array", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    let descriptorReads = 0;
    const dense = new Proxy(
      Array.from({ length: 10_000 }, (_value, index) => index),
      {
        getOwnPropertyDescriptor(target, property) {
          descriptorReads += 1;
          return Reflect.getOwnPropertyDescriptor(target, property);
        }
      }
    );

    logger.info("bounded_array_descriptors", { dense });

    expect(descriptorReads).toBeLessThanOrEqual(65);
    expect(String(info.mock.calls[0]?.[0])).toContain("array items omitted");
  });

  it("emits a bounded core envelope when a safe payload exceeds the line limit", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const oversizedFields = Object.fromEntries(
      Array.from({ length: 9 }, (_value, index) => [`safe_${index}`, "x".repeat(4_096)])
    );

    logger.info("oversized_payload", oversizedFields);

    const line = String(info.mock.calls[0]?.[0]);
    const payload = JSON.parse(line) as Record<string, unknown>;
    expect(line.length).toBeLessThanOrEqual(32_768);
    expect(payload).toMatchObject({
      level: "info",
      service: "shiftflow-api",
      message: "oversized_payload",
      log_truncated: true
    });
    expect(payload).not.toHaveProperty("safe_0");
  });

  it("enforces the line limit in UTF-8 bytes", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);

    logger.info("oversized_utf8_payload", {
      first: "界".repeat(3_000),
      second: "界".repeat(3_000),
      third: "界".repeat(3_000),
      fourth: "🙂".repeat(1_500)
    });

    const line = String(info.mock.calls[0]?.[0]);
    const payload = JSON.parse(line) as Record<string, unknown>;
    expect(Buffer.byteLength(line, "utf8")).toBeLessThanOrEqual(32_768);
    expect(payload).toMatchObject({ log_truncated: true, message: "oversized_utf8_payload" });
    expect(payload).not.toHaveProperty("first");
  });

  it("rejects a non-JSON string returned by the serialiser", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const serialise = vi.spyOn(JSON, "stringify").mockReturnValue("not-json");

    logger.info("invalid_serialisation", { safe: true });
    const line = String(info.mock.calls[0]?.[0]);
    serialise.mockRestore();

    expect(() => JSON.parse(line)).not.toThrow();
    expect(JSON.parse(line)).toMatchObject({ message: "log_serialisation_failed" });
  });

  it("emits a minimal valid JSON fallback when serialisation itself fails", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const serialise = vi.spyOn(JSON, "stringify").mockImplementation(() => {
      throw new Error("serialisation failed");
    });

    expect(() => logger.info("fallback", { safe: true })).not.toThrow();
    const line = String(info.mock.calls[0]?.[0]);
    serialise.mockRestore();

    expect(() => JSON.parse(line)).not.toThrow();
    expect(JSON.parse(line)).toMatchObject({
      level: "info",
      service: "shiftflow-api",
      message: "log_serialisation_failed"
    });
  });
});
