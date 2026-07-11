// en-GB: Provides shared api definitions so frontend modules use one consistent implementation.
import type { ApiEnvelope, Filters } from "./types";

export const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";
const csrfCookieName = "shiftflow_csrf";

function csrfTokenFromCookie() {
  if (typeof document === "undefined") return undefined;
  return document.cookie
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${csrfCookieName}=`))
    ?.slice(csrfCookieName.length + 1);
}

function isUnsafeMethod(method: string | undefined) {
  return ["POST", "PUT", "PATCH", "DELETE"].includes((method ?? "GET").toUpperCase());
}

function shouldAttachCsrf(path: string, init: RequestInit) {
  return isUnsafeMethod(init.method) && path !== "/api/auth/login";
}

export async function apiRequest<T>(path: string, token?: string, init: RequestInit = {}) {
  const csrfToken = shouldAttachCsrf(path, init) ? csrfTokenFromCookie() : undefined;
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
      ...init.headers
    }
  });
  const payload = (await response.json().catch(() => ({}))) as ApiEnvelope<T> & {
    error?: { message?: string };
  };
  if (!response.ok) throw new Error(payload.error?.message ?? `HTTP ${response.status}`);
  return payload.data;
}

export function queryString(filters: Filters, search: string) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  if (search.trim()) params.set("search", search.trim());
  return params.toString() ? `?${params.toString()}` : "";
}
