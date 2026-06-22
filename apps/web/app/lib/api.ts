import type { ApiEnvelope, Filters } from "./types";

export const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";

export async function apiRequest<T>(path: string, token?: string, init: RequestInit = {}) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers
    }
  });
  const payload = (await response.json().catch(() => ({}))) as ApiEnvelope<T> & { error?: { message?: string } };
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
