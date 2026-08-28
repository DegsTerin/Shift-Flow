// en-GB: Keeps public same-origin routing explicit so Render never exposes a split-host cookie topology.
const exactApiPaths = new Set(["/health", "/ready"]);

export function isApiRequestPath(pathname) {
  return exactApiPaths.has(pathname) || pathname === "/api" || pathname.startsWith("/api/");
}
