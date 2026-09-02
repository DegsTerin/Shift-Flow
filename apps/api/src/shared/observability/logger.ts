// en-GB: Emits bounded structured logs without allowing diagnostic data to disrupt application flow.
import { Buffer } from "node:buffer";
import { env } from "../config/env.js";

type LogLevel = "debug" | "info" | "warn" | "error";
type LogFields = Record<string, unknown>;
type SanitisedPrimitive = boolean | number | string | null;
type SanitisedValue = SanitisedPrimitive | SanitisedObject | SanitisedValue[];
type SanitisedContainer = SanitisedObject | SanitisedValue[];
type Descriptors = Record<PropertyKey, PropertyDescriptor>;

interface SanitisedObject {
  [key: string]: SanitisedValue;
}

const levelWeight: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const configuredLevel = env.LOG_LEVEL as LogLevel;
const minimumLevel = levelWeight[configuredLevel] ? configuredLevel : "info";

const SERVICE_NAME = "shiftflow-api";
const REDACTED = "[REDACTED]";
const ACCESSOR_OMITTED = "[Accessor omitted]";
const MAX_DEPTH = 8;
const MAX_KEYS = 64;
const MAX_ARRAY_ITEMS = 64;
const MAX_STRING_LENGTH = 4_096;
const MAX_KEY_LENGTH = 256;
const MAX_LINE_LENGTH = 32_768;
const MAX_ASSIGNMENT_VALUE_LENGTH = 512;
const MAX_TRAVERSAL_VALUES = 512;
const dateToISOString = Date.prototype.toISOString;

const PEM_PATTERN =
  /-----BEGIN [A-Z0-9][A-Z0-9 ]*-----[\s\S]*?(?:-----END [A-Z0-9][A-Z0-9 ]*-----|$)/gi;
const LABELLED_DIGEST_AUTH_PATTERN = /\b((?:proxy-)?authorization)(\s*:\s*)Digest\b[^\r\n]*/gi;
const AUTH_PATTERN = /\b(Bearer|Basic)\s+[^\r\n,;&})]+/gi;
const REDACTED_AUTH_VALUE_PATTERN = /^(?:Bearer|Basic)\s+\[REDACTED\]/i;
const JWT_PATTERN =
  /\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{2,}\.[A-Za-z0-9_-]{8,}(?![A-Za-z0-9_-])/g;
const URI_USERINFO_PATTERN = /([a-z][a-z0-9+.-]*:\/\/)([^/\s?#@]+)@/gi;
const TRUNCATED_URI_USERINFO_PATTERN = /([a-z][a-z0-9+.-]*:\/\/)[^/\s?#@]*$/i;
const TRUNCATED_JWT_PATTERN = /\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{1,}(?:\.[A-Za-z0-9_-]*)?$/;
const URI_QUERY_PATTERN = /([?&#])([^=&#\s]+)=([^&#\s]*)/g;
const LABELLED_COOKIE_PATTERN = /\b((?:set-)?cookie)\s*:\s*[^\r\n]*/gi;
const COOKIE_PAIR_PATTERN = /(^|;\s*)([A-Za-z0-9!#$%&'*+.^_`|~-]+)=([^;\r\n]*)/g;
const FIRST_COOKIE_PAIR_PATTERN = /^([A-Za-z0-9!#$%&'*+.^_`|~-]+)=/;
const ASSIGNMENT_LABEL_PATTERN =
  /(^|[\s,;&{(\x5b])(["']?)([A-Za-z_][A-Za-z0-9_. -]{0,63})\2\s*[:=]\s*/g;
const COOKIE_ATTRIBUTES = new Set(["domain", "expires", "maxage", "path", "samesite"]);
const COOKIE_SECRET_NAMES = new Set([
  "accesstoken",
  "auth",
  "authtoken",
  "connectsid",
  "jwt",
  "jwttoken",
  "refresh",
  "refreshtoken",
  "session",
  "sessionid",
  "sid",
  "token"
]);
const NATIVE_ERROR_NAMES = new Set([
  "AggregateError",
  "Error",
  "EvalError",
  "RangeError",
  "ReferenceError",
  "SyntaxError",
  "TypeError",
  "URIError"
]);

function createObject(): SanitisedObject {
  return Object.create(null) as SanitisedObject;
}

function normaliseKey(key: string) {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isSensitiveKey(key: string) {
  const value = normaliseKey(key);
  const safeTokenMetadata =
    /(?:tokencount|tokenexpiresat|tokenexpiry|tokenissuer|tokenlimit|tokenstatus|tokenttl|tokentype)$/;
  return (
    COOKIE_SECRET_NAMES.has(value) ||
    [
      "authorization",
      "proxyauthorization",
      "auth",
      "authentication",
      "cookie",
      "setcookie",
      "csrf",
      "xsrf",
      "sid",
      "pwd",
      "passwd",
      "session",
      "sessionid",
      "authcode",
      "authorizationcode",
      "codeverifier",
      "pkcecodeverifier",
      "pkceverifier",
      "connectionstring",
      "databaseurl"
    ].includes(value) ||
    value.includes("password") ||
    value.includes("passphrase") ||
    value.includes("secret") ||
    (value.includes("token") && !safeTokenMetadata.test(value)) ||
    [
      "accesskeyid",
      "apikey",
      "privatekey",
      "signingkey",
      "subscriptionkey",
      "credential",
      "signature"
    ].some((part) => value.includes(part))
  );
}

function isSensitiveAssignmentKey(key: string) {
  const value = normaliseKey(key);
  return isSensitiveKey(key) || ["code", "pkce"].includes(value);
}

function isStackLikeKey(key: string) {
  return normaliseKey(key).includes("stack");
}

function hasCookieSignal(input: string) {
  const firstPair = FIRST_COOKIE_PAIR_PATTERN.exec(input);
  return Boolean(firstPair?.[1] && COOKIE_SECRET_NAMES.has(normaliseKey(firstPair[1])));
}

function decodedUriKey(value: string) {
  let decoded = value.replace(/\+/g, " ");
  for (let remaining = 2; remaining > 0; remaining -= 1) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    } catch {
      break;
    }
  }
  return decoded;
}

function assignmentValue(input: string, start: number) {
  if (input.startsWith(REDACTED, start)) {
    return { end: start + REDACTED.length, replacement: REDACTED };
  }

  const redactedAuthorisation = REDACTED_AUTH_VALUE_PATTERN.exec(input.slice(start));
  if (redactedAuthorisation) {
    const markerEnd = start + redactedAuthorisation[0].length;
    const limit = Math.min(input.length, start + MAX_ASSIGNMENT_VALUE_LENGTH);
    return { end: unquotedAssignmentEnd(input, markerEnd, limit), replacement: REDACTED };
  }

  const quote = input[start];
  const limit = Math.min(input.length, start + MAX_ASSIGNMENT_VALUE_LENGTH);

  if (quote === '"' || quote === "'") {
    let index = start + 1;
    while (index < limit) {
      if (input[index] === "\\" && index + 1 < limit) {
        index += 2;
        continue;
      }
      if (input[index] === quote) {
        return { end: index + 1, replacement: `${quote}${REDACTED}${quote}` };
      }
      index += 1;
    }
    return { end: input.length, replacement: `${quote}${REDACTED}` };
  }

  return { end: unquotedAssignmentEnd(input, start, limit), replacement: REDACTED };
}

function unquotedAssignmentEnd(
  input: string,
  start: number,
  limit = Math.min(input.length, start + MAX_ASSIGNMENT_VALUE_LENGTH)
) {
  let end = start;
  while (end < limit && !/[\r\n,;\]}&)]/.test(input[end])) end += 1;
  if (end === limit && end < input.length && !/[\r\n,;\]}&)]/.test(input[end])) {
    return input.length;
  }
  return end;
}

function sanitiseAssignments(input: string) {
  let cursor = 0;
  let output = "";
  ASSIGNMENT_LABEL_PATTERN.lastIndex = 0;

  for (let match = ASSIGNMENT_LABEL_PATTERN.exec(input); match; ) {
    const label = match[3];
    const valueStart = ASSIGNMENT_LABEL_PATTERN.lastIndex;
    if (isSensitiveAssignmentKey(label)) {
      const sanitised = assignmentValue(input, valueStart);
      output += `${input.slice(cursor, valueStart)}${sanitised.replacement}`;
      cursor = sanitised.end;
      ASSIGNMENT_LABEL_PATTERN.lastIndex = sanitised.end;
    } else {
      ASSIGNMENT_LABEL_PATTERN.lastIndex = match.index + 1;
    }
    match = ASSIGNMENT_LABEL_PATTERN.exec(input);
  }

  return `${output}${input.slice(cursor)}`;
}

function sanitiseText(input: string, maximumLength = MAX_STRING_LENGTH) {
  const truncated = input.length > maximumLength;
  let value = input.slice(0, maximumLength);

  value = value
    .replace(PEM_PATTERN, REDACTED)
    .replace(
      LABELLED_DIGEST_AUTH_PATTERN,
      (_match, label: string, separator: string) => `${label}${separator}${REDACTED}`
    )
    .replace(AUTH_PATTERN, (_match, scheme: string) => `${scheme} ${REDACTED}`)
    .replace(LABELLED_COOKIE_PATTERN, (_match, label: string) => `${label}: ${REDACTED}`);

  if (hasCookieSignal(value)) {
    value = value.replace(
      COOKIE_PAIR_PATTERN,
      (match: string, prefix: string, name: string): string =>
        COOKIE_ATTRIBUTES.has(normaliseKey(name)) ? match : `${prefix}${name}=${REDACTED}`
    );
  }

  value = sanitiseAssignments(value);

  value = value
    .replace(JWT_PATTERN, REDACTED)
    .replace(URI_USERINFO_PATTERN, (_match, scheme: string) => `${scheme}${REDACTED}@`)
    .replace(URI_QUERY_PATTERN, (match: string, separator: string, rawKey: string): string => {
      const key = decodedUriKey(rawKey);
      return ["key", "sig"].includes(normaliseKey(key)) || isSensitiveAssignmentKey(key)
        ? `${separator}${rawKey}=${REDACTED}`
        : match;
    });

  if (truncated) {
    value = value
      .replace(TRUNCATED_URI_USERINFO_PATTERN, (_match, scheme: string) => {
        return `${scheme}${REDACTED}`;
      })
      .replace(TRUNCATED_JWT_PATTERN, REDACTED);
  }

  if (truncated || value.length > maximumLength) {
    const marker = "[truncated]";
    return `${value.slice(0, Math.max(0, maximumLength - marker.length))}${marker}`;
  }

  return value;
}

function descriptorsOf(value: object) {
  try {
    return Object.getOwnPropertyDescriptors(value) as Descriptors;
  } catch {
    return undefined;
  }
}

function nativeErrorName(value: object) {
  try {
    let prototype: object | null = Object.getPrototypeOf(value) as object | null;
    for (let remaining = 8; prototype && remaining > 0; remaining -= 1) {
      const descriptor = Object.getOwnPropertyDescriptor(prototype, "name");
      if (
        descriptor &&
        "value" in descriptor &&
        typeof descriptor.value === "string" &&
        NATIVE_ERROR_NAMES.has(descriptor.value)
      ) {
        return descriptor.value;
      }
      prototype = Object.getPrototypeOf(prototype) as object | null;
    }
  } catch {
    // A hostile prototype is not sufficient evidence of an Error value.
  }
  return undefined;
}

function hasErrorBrand(value: object): value is Error {
  try {
    return value instanceof Error;
  } catch {
    return false;
  }
}

function hasDateBrand(value: object): value is Date {
  try {
    return value instanceof Date;
  } catch {
    return false;
  }
}

function hasHeadersBrand(value: object): value is Headers {
  try {
    return typeof Headers !== "undefined" && value instanceof Headers;
  } catch {
    return false;
  }
}

function hasErrorShape(value: object) {
  try {
    const message = Object.getOwnPropertyDescriptor(value, "message");
    return Boolean(
      message && "value" in message && typeof message.value === "string" && nativeErrorName(value)
    );
  } catch {
    return false;
  }
}

class Sanitiser {
  private readonly active = new WeakSet<object>();
  private readonly memo = new WeakMap<object, SanitisedContainer>();
  private remainingTraversalValues = MAX_TRAVERSAL_VALUES;

  value(input: unknown, depth = 0): SanitisedValue {
    if (this.remainingTraversalValues <= 0) return "[Traversal limit reached]";
    this.remainingTraversalValues -= 1;
    if (depth > MAX_DEPTH) return "[Depth limit reached]";
    if (input === null) return null;
    if (typeof input === "string") return sanitiseText(input);
    if (typeof input === "boolean") return input;
    if (typeof input === "number") return Number.isFinite(input) ? input : `[${String(input)}]`;
    if (typeof input === "bigint") return sanitiseText(`${input.toString()}n`);
    if (typeof input === "undefined") return "[Undefined]";
    if (typeof input === "function") return "[Function]";
    if (typeof input === "symbol") {
      try {
        return sanitiseText(String(input));
      } catch {
        return "[Symbol]";
      }
    }

    const object = input as object;
    if (this.active.has(object)) return "[Circular reference]";
    const memoised = this.memo.get(object);
    if (memoised) return memoised;

    if (hasDateBrand(object)) {
      try {
        return dateToISOString.call(object);
      } catch {
        return "[Invalid Date]";
      }
    }
    if (hasErrorBrand(object)) return this.error(object, depth);
    if (hasHeadersBrand(object)) return this.headers(object, depth);

    try {
      if (Array.isArray(object)) return this.array(object, depth);
    } catch {
      return "[Unreadable object]";
    }
    if (hasErrorShape(object)) return this.error(object, depth);

    try {
      return this.object(object, depth);
    } catch {
      return "[Unreadable object]";
    }
  }

  private descriptor(descriptor: PropertyDescriptor | undefined, depth: number): SanitisedValue {
    return descriptor && "value" in descriptor
      ? this.value(descriptor.value, depth)
      : ACCESSOR_OMITTED;
  }

  private track<T extends SanitisedContainer>(source: object, output: T, populate: () => void): T {
    this.memo.set(source, output);
    this.active.add(source);
    try {
      populate();
      return output;
    } finally {
      this.active.delete(source);
    }
  }

  private copy(output: SanitisedObject, descriptors: Descriptors, keys: string[], depth: number) {
    const permittedKeys =
      env.NODE_ENV === "production" ? keys.filter((key) => !isStackLikeKey(key)) : keys;
    const available = Math.max(0, MAX_KEYS - Object.keys(output).length);
    const retained =
      permittedKeys.length > available ? Math.max(0, available - 1) : permittedKeys.length;

    for (let index = 0; index < retained; index += 1) {
      const sourceKey = permittedKeys[index];
      let outputKey = sanitiseText(sourceKey, MAX_KEY_LENGTH);
      if (Object.hasOwn(output, outputKey)) outputKey = `field_${index}`;
      output[outputKey] = isSensitiveKey(sourceKey)
        ? REDACTED
        : this.descriptor(descriptors[sourceKey], depth + 1);
    }

    if (permittedKeys.length > retained && available > 0) {
      output._truncated = `[${permittedKeys.length - retained} properties omitted]`;
    }
  }

  private object(source: object, depth: number): SanitisedValue {
    const descriptors = descriptorsOf(source);
    if (!descriptors) return "[Unreadable object]";

    const output = createObject();
    return this.track(source, output, () => {
      const keys = Reflect.ownKeys(descriptors).filter(
        (key): key is string => typeof key === "string" && descriptors[key]?.enumerable === true
      );
      this.copy(output, descriptors, keys, depth);
    });
  }

  private array(source: unknown[], depth: number): SanitisedValue {
    const output: SanitisedValue[] = [];
    try {
      const lengthDescriptor = Object.getOwnPropertyDescriptor(source, "length");
      const length =
        lengthDescriptor && "value" in lengthDescriptor ? lengthDescriptor.value : undefined;
      if (typeof length !== "number" || !Number.isSafeInteger(length) || length < 0) {
        return "[Unreadable array]";
      }

      return this.track(source, output, () => {
        const retained = length > MAX_ARRAY_ITEMS ? MAX_ARRAY_ITEMS - 1 : length;
        for (let index = 0; index < retained; index += 1) {
          const descriptor = Object.getOwnPropertyDescriptor(source, String(index));
          output.push(descriptor ? this.descriptor(descriptor, depth + 1) : "[Empty array item]");
        }
        if (length > retained) output.push(`[${length - retained} array items omitted]`);
      });
    } catch {
      this.memo.delete(source);
      return "[Unreadable array]";
    }
  }

  private error(source: object, depth: number): SanitisedValue {
    const descriptors = descriptorsOf(source);
    if (!descriptors) return "[Unreadable Error]";

    const output = createObject();
    return this.track(source, output, () => {
      const errorName = this.errorName(source, descriptors);
      output.name = errorName;
      output.message = descriptors.message ? this.descriptor(descriptors.message, depth + 1) : "";
      if (descriptors.cause) output.cause = this.descriptor(descriptors.cause, depth + 1);
      if (errorName === "AggregateError" && descriptors.errors) {
        output.errors = this.descriptor(descriptors.errors, depth + 1);
      }
      if (env.NODE_ENV !== "production" && descriptors.stack) {
        output.stack = this.descriptor(descriptors.stack, depth + 1);
      }

      const reserved = new Set(["name", "message", "cause", "stack"]);
      if (errorName === "AggregateError") reserved.add("errors");
      const custom = Reflect.ownKeys(descriptors).filter(
        (key): key is string =>
          typeof key === "string" && !reserved.has(key) && descriptors[key]?.enumerable === true
      );
      this.copy(output, descriptors, custom, depth);
    });
  }

  private errorName(source: object, descriptors: Descriptors) {
    const own = descriptors.name;
    if (own && "value" in own && typeof own.value === "string") {
      return sanitiseText(own.value);
    }

    return nativeErrorName(source) ?? "Error";
  }

  private headers(source: Headers, depth: number): SanitisedValue {
    const output = createObject();
    try {
      return this.track(source, output, () => {
        let count = 0;
        for (const [name, value] of Headers.prototype.entries.call(source)) {
          if (count >= MAX_KEYS - 1) {
            output._truncated = "[Additional headers omitted]";
            break;
          }
          output[sanitiseText(name, MAX_KEY_LENGTH)] = isSensitiveKey(name)
            ? REDACTED
            : this.value(value, depth + 1);
          count += 1;
        }
      });
    } catch {
      this.memo.delete(source);
      return "[Unreadable Headers]";
    }
  }
}

function timestamp() {
  try {
    const value = dateToISOString.call(new Date());
    return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
      ? value
      : "1970-01-01T00:00:00.000Z";
  } catch {
    return "1970-01-01T00:00:00.000Z";
  }
}

function manualFallbackLine(value: string, level: LogLevel) {
  return `{"timestamp":"${value}","level":"${level}","service":"${SERVICE_NAME}","message":"log_serialisation_failed"}`;
}

function isValidLine(
  line: unknown,
  value: string,
  level: LogLevel,
  message: string
): line is string {
  try {
    if (typeof line !== "string" || Buffer.byteLength(line, "utf8") > MAX_LINE_LENGTH) {
      return false;
    }
    const parsed = JSON.parse(line) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return false;
    const envelope = parsed as Record<string, unknown>;
    return (
      envelope.timestamp === value &&
      envelope.level === level &&
      envelope.service === SERVICE_NAME &&
      envelope.message === message
    );
  } catch {
    return false;
  }
}

function serialise(payload: SanitisedObject, value: string, level: LogLevel, message: string) {
  try {
    const line = JSON.stringify(payload);
    if (isValidLine(line, value, level, message)) return line;
  } catch {
    // Fall through to the bounded core envelope.
  }

  try {
    const line = JSON.stringify({
      timestamp: value,
      level,
      service: SERVICE_NAME,
      message,
      log_truncated: true
    });
    if (isValidLine(line, value, level, message)) return line;
  } catch {
    // The manual line below contains only fixed values and a safe ISO timestamp.
  }

  return manualFallbackLine(value, level);
}

function emit(level: LogLevel, line: string) {
  try {
    if (level === "error") console.error(line);
    else if (level === "warn") console.warn(line);
    else console.info(line);
  } catch {
    // Observability must never become an application failure source.
  }
}

function write(level: LogLevel, message: string, fields: LogFields = {}) {
  try {
    if (levelWeight[level] < levelWeight[minimumLevel]) return;

    const time = timestamp();
    const safeMessage =
      typeof message === "string" ? sanitiseText(message) : "[Invalid log message]";
    const safeFields = new Sanitiser().value(fields);
    const payload = createObject();

    if (safeFields && typeof safeFields === "object" && !Array.isArray(safeFields)) {
      Object.assign(payload, safeFields);
    } else {
      payload.context = safeFields;
    }

    payload.timestamp = time;
    payload.level = level;
    payload.service = SERVICE_NAME;
    payload.message = safeMessage;
    emit(level, serialise(payload, time, level, safeMessage));
  } catch {
    const time = timestamp();
    emit(level, manualFallbackLine(time, level));
  }
}

export const logger = {
  debug: (message: string, fields?: LogFields) => write("debug", message, fields),
  info: (message: string, fields?: LogFields) => write("info", message, fields),
  warn: (message: string, fields?: LogFields) => write("warn", message, fields),
  error: (message: string, fields?: LogFields) => write("error", message, fields)
};
