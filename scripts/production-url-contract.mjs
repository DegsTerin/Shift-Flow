// en-GB: Validates public URL topology so cookie and origin controls cannot receive an unusable production shape.
import { URL } from "node:url";

function canonicalHttpsOrigin(value, variableName) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${variableName} must contain an absolute URL`);
  }
  if (parsed.protocol !== "https:") {
    throw new Error(`${variableName} must use HTTPS in production`);
  }
  if (
    parsed.username ||
    parsed.password ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash ||
    value !== parsed.origin
  ) {
    throw new Error(`${variableName} must contain a canonical origin without credentials or path`);
  }
  return parsed;
}

export function validateProductionUrlContract(corsOrigin, publicApiBaseUrl) {
  const apiUrl = canonicalHttpsOrigin(publicApiBaseUrl, "NEXT_PUBLIC_API_BASE_URL");
  const origins = corsOrigin.split(",").map((value) => value.trim());
  if (!origins.length || origins.some((origin) => !origin)) {
    throw new Error("CORS_ORIGIN must contain one or more canonical origins");
  }
  for (const origin of origins) {
    const webUrl = canonicalHttpsOrigin(origin, "CORS_ORIGIN");
    if (webUrl.hostname !== apiUrl.hostname) {
      throw new Error(
        "CORS_ORIGIN and NEXT_PUBLIC_API_BASE_URL must share a hostname for cookie-based CSRF"
      );
    }
  }
}
