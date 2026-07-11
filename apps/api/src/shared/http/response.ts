// en-GB: Defines the response implementation so this project responsibility remains explicit and maintainable.
const redactedResponseKeys = new Set(["password", "passwordHash", "tokenHash"]);
const redactedResponseKeyPattern =
  /(api[-_]?key|authorization|cookie|credential|jwt|password|refresh[-_]?token|secret|token[-_]?hash)/i;

function isRedactedResponseKey(key: string) {
  return redactedResponseKeys.has(key) || redactedResponseKeyPattern.test(key);
}

function sanitizeResponse(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sanitizeResponse);
  }
  if (!value || typeof value !== "object" || value instanceof Date) {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      isRedactedResponseKey(key) ? undefined : sanitizeResponse(entry)
    ])
  );
}

export function ok<T>(data: T, meta?: unknown) {
  return { data: sanitizeResponse(data) as T, meta };
}

export function created<T>(data: T) {
  return { data: sanitizeResponse(data) as T };
}
