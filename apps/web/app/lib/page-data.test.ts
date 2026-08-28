// en-GB: Verifies page-data composition preserves endpoint identity and server pagination.
import { describe, expect, it, vi } from "vitest";
import { emptyFilters } from "./utils";
import {
  activityTablePageSize,
  fetchManagementData,
  fetchPageData,
  fetchReferenceData,
  fetchRbacData,
  kanbanPageSize,
  lastPageForTotal,
  managementPageSize,
  rbacPageSize,
  type PageRequester
} from "./page-data";

function activity(id: string) {
  return { id, title: id };
}

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  let reject: (reason: unknown) => void = () => undefined;
  const promise = new Promise<T>((complete, fail) => {
    resolve = complete;
    reject = fail;
  });
  return { promise, reject, resolve };
}

describe("fetchPageData", () => {
  it("loads only the active view consumers and keeps their endpoint identities separate", async () => {
    const request = vi.fn(async (path: string) => {
      if (path.startsWith("/api/dashboard/summary")) return { total: 1 };
      if (path.startsWith("/api/dashboard/charts")) return { byStatus: [] };
      if (path.startsWith("/api/dashboard/operational-list")) return [activity("operational")];
      if (path === "/api/dashboard/configuration/MAIN") {
        return { dashboardType: "MAIN", widgets: [] };
      }
      if (path === "/api/dashboard/configuration/TEAM") {
        return { dashboardType: "TEAM", widgets: [] };
      }
      if (path.startsWith("/api/activities")) {
        return { items: [activity("activity-page")], total: 31, page: 3, pageSize: 12 };
      }
      throw new Error(`Unexpected request: ${path}`);
    });
    const controller = new AbortController();

    const activityResult = await fetchPageData({
      token: "token",
      can: (resource, action) =>
        action === "read" && (resource === "dashboard" || resource === "activities"),
      filters: emptyFilters,
      search: "needle",
      activityPage: 3,
      kanbanPage: 1,
      view: "activities",
      signal: controller.signal,
      request: request as unknown as PageRequester
    });

    expect(activityResult.dashboard).toBeUndefined();
    expect(activityResult.activities).toMatchObject({
      items: [activity("activity-page")],
      total: 31
    });
    expect(request.mock.calls.some(([path]) => String(path).startsWith("/api/dashboard"))).toBe(
      false
    );
    expect(request).toHaveBeenCalledWith(
      `/api/activities?search=needle&page=3&pageSize=${activityTablePageSize}`,
      "token",
      { signal: controller.signal }
    );

    request.mockClear();
    const dashboardResult = await fetchPageData({
      token: "token",
      can: (resource, action) =>
        action === "read" && (resource === "dashboard" || resource === "activities"),
      filters: emptyFilters,
      search: "needle",
      activityPage: 3,
      kanbanPage: 1,
      view: "dashboard",
      signal: controller.signal,
      request: request as unknown as PageRequester
    });

    expect(dashboardResult.dashboard?.operationalActivities).toEqual([activity("operational")]);
    expect(dashboardResult.activities).toBeUndefined();
    expect(request.mock.calls.some(([path]) => String(path).startsWith("/api/activities"))).toBe(
      false
    );
    expect(request).toHaveBeenCalledWith(
      "/api/dashboard/configuration/MAIN",
      "token",
      expect.any(Object)
    );
    expect(request).not.toHaveBeenCalledWith(
      "/api/dashboard/configuration/TEAM",
      expect.anything(),
      expect.anything()
    );
  });

  it("uses a separately navigable bounded page for Kanban", async () => {
    const request = vi.fn(async () => ({ items: [], total: 0 }));

    await fetchPageData({
      token: "token",
      can: (resource, action) => resource === "activities" && action === "read",
      filters: emptyFilters,
      search: "",
      activityPage: 7,
      kanbanPage: 3,
      view: "kanban",
      signal: new AbortController().signal,
      request: request as unknown as PageRequester
    });

    expect(request).toHaveBeenCalledWith(
      `/api/activities?page=3&pageSize=${kanbanPageSize}`,
      "token",
      expect.any(Object)
    );
  });

  it("uses the reports permission and exact reports endpoint without unrelated query fields", async () => {
    const request = vi.fn(async (path: string) => {
      if (path.startsWith("/api/reports/activities")) {
        return { total: 3, byStatus: [], byPriority: [] };
      }
      throw new Error(`Unexpected request: ${path}`);
    });

    const result = await fetchPageData({
      token: "token",
      can: (resource, action) => resource === "reports" && action === "read",
      filters: {
        ...emptyFilters,
        clientId: "client-a",
        teamId: "team-a",
        shiftId: "shift-a",
        assigneeId: "assignee-must-not-be-sent",
        priority: "CRITICAL",
        status: "DONE",
        attention: "OVERDUE",
        from: "2026-08-01",
        to: "2026-08-27"
      },
      search: "must-not-be-sent",
      activityPage: 1,
      kanbanPage: 1,
      view: "reports",
      signal: new AbortController().signal,
      request: request as unknown as PageRequester
    });

    expect(result.dashboard).toBeUndefined();
    expect(result.activities).toBeUndefined();
    expect(result.report).toEqual({ total: 3, byStatus: [], byPriority: [] });
    expect(result.errors).toEqual([]);
    expect(request).toHaveBeenCalledOnce();
    expect(request).toHaveBeenCalledWith(
      "/api/reports/activities?clientId=client-a&teamId=team-a&shiftId=shift-a&status=DONE&from=2026-08-01&to=2026-08-27",
      "token",
      expect.any(Object)
    );
  });

  it("loads only TEAM configuration for the team dashboard", async () => {
    const request = vi.fn(async (path: string) => {
      if (path.startsWith("/api/dashboard/charts")) return { byStatus: [] };
      if (path.startsWith("/api/dashboard/operational-list")) return [];
      if (path === "/api/dashboard/configuration/TEAM") {
        return { dashboardType: "TEAM", widgets: [] };
      }
      throw new Error(`Unexpected request: ${path}`);
    });

    const result = await fetchPageData({
      token: "token",
      can: (resource, action) => resource === "dashboard" && action === "read",
      filters: emptyFilters,
      search: "",
      activityPage: 1,
      kanbanPage: 1,
      view: "team-dashboard",
      signal: new AbortController().signal,
      request: request as unknown as PageRequester
    });

    expect(result.dashboard?.layouts).toEqual({
      TEAM: { dashboardType: "TEAM", widgets: [] }
    });
    expect(result.dashboard?.summary).toBeUndefined();
    expect(request.mock.calls.some(([path]) => path === "/api/dashboard/summary")).toBe(false);
    expect(request.mock.calls.some(([path]) => path === "/api/dashboard/configuration/MAIN")).toBe(
      false
    );
  });

  it("loads the requested server page for the team dashboard directory", async () => {
    const signal = new AbortController().signal;
    const request = vi.fn(async (path: string) => {
      if (path.startsWith("/api/dashboard/charts")) return { byStatus: [] };
      if (path.startsWith("/api/dashboard/operational-list")) return [];
      if (path === "/api/dashboard/configuration/TEAM") {
        return { dashboardType: "TEAM", widgets: [] };
      }
      if (path.startsWith("/api/teams?")) {
        return {
          items: [{ id: "team-26", name: "Team 26" }],
          total: 26,
          page: 3,
          pageSize: managementPageSize
        };
      }
      throw new Error(`Unexpected request: ${path}`);
    });

    const result = await fetchPageData({
      token: "token",
      can: (resource, action) =>
        action === "read" && (resource === "dashboard" || resource === "teams"),
      filters: emptyFilters,
      search: "  team 26  ",
      activityPage: 1,
      kanbanPage: 1,
      teamPage: 3,
      view: "team-dashboard",
      signal,
      request: request as unknown as PageRequester
    });

    expect(result.teamDirectory).toEqual({
      items: [{ id: "team-26", name: "Team 26" }],
      total: 26,
      page: 3,
      pageSize: managementPageSize
    });
    expect(request).toHaveBeenCalledWith(
      `/api/teams?page=3&pageSize=${managementPageSize}&search=team+26`,
      "token",
      { signal }
    );
  });

  it("fails a TEAM snapshot atomically without requesting MAIN configuration", async () => {
    const request = vi.fn(async (path: string) => {
      if (path === "/api/dashboard/configuration/TEAM") throw new Error("TEAM failed");
      return {};
    });

    const result = await fetchPageData({
      token: "token",
      can: (resource, action) => resource === "dashboard" && action === "read",
      filters: emptyFilters,
      search: "",
      activityPage: 1,
      kanbanPage: 1,
      view: "team-dashboard",
      signal: new AbortController().signal,
      request: request as unknown as PageRequester
    });

    expect(result.dashboard).toBeUndefined();
    expect(result.errors).toEqual([expect.objectContaining({ message: "TEAM failed" })]);
    expect(request.mock.calls.some(([path]) => path === "/api/dashboard/configuration/MAIN")).toBe(
      false
    );
  });

  it("calculates the last valid server page without allowing page zero", () => {
    expect(lastPageForTotal(0, activityTablePageSize)).toBe(1);
    expect(lastPageForTotal(24, activityTablePageSize)).toBe(2);
    expect(lastPageForTotal(25, activityTablePageSize)).toBe(3);
  });
});

describe("fetchManagementData", () => {
  it("carries explicit server pagination and bounded search for the active resource", async () => {
    const request = vi.fn(async (path: string) => {
      void path;
      return { items: [{ id: "user-26" }], total: 26 };
    });
    const signal = new AbortController().signal;

    const result = await fetchManagementData({
      token: "token",
      can: (resource, action) => resource === "users" && action === "read",
      view: "users",
      page: 2,
      search: `  ${"x".repeat(220)}  `,
      signal,
      request: request as unknown as PageRequester
    });

    expect(result).toMatchObject({ items: [{ id: "user-26" }], total: 26 });
    const [path] = request.mock.calls[0] ?? [];
    const url = new URL(String(path), "https://shiftflow.local");
    expect(url.pathname).toBe("/api/users");
    expect(url.searchParams.get("page")).toBe("2");
    expect(url.searchParams.get("pageSize")).toBe(String(managementPageSize));
    expect(url.searchParams.get("search")).toHaveLength(200);
    expect(request).toHaveBeenCalledWith(expect.any(String), "token", { signal });
  });

  it("does not request an unauthorised management resource", async () => {
    const request = vi.fn();

    await expect(
      fetchManagementData({
        token: "token",
        can: () => false,
        view: "clients",
        page: 1,
        search: "",
        signal: new AbortController().signal,
        request: request as unknown as PageRequester
      })
    ).resolves.toBeUndefined();
    expect(request).not.toHaveBeenCalled();
  });
});

describe("fetchReferenceData", () => {
  it("keeps successful reference resources when an unrelated resource fails", async () => {
    const shiftsFailure = new Error("shifts unavailable");
    const signal = new AbortController().signal;
    const request = vi.fn(async (path: string) => {
      if (path === "/api/clients") {
        return {
          items: [{ id: "client-a", name: "Client A" }],
          total: 1,
          page: 1,
          pageSize: 25
        };
      }
      if (path === "/api/shifts") throw shiftsFailure;
      throw new Error(`Unexpected request: ${path}`);
    });

    const result = await fetchReferenceData({
      token: "token",
      can: (resource, action) =>
        action === "read" && (resource === "clients" || resource === "shifts"),
      signal,
      request: request as unknown as PageRequester
    });

    expect(result.clients).toMatchObject({
      items: [{ id: "client-a", name: "Client A" }],
      total: 1
    });
    expect(result.shifts).toBeUndefined();
    expect(result.errors).toEqual({ shifts: shiftsFailure });
    expect(request).toHaveBeenCalledTimes(2);
    expect(request).toHaveBeenCalledWith("/api/clients", "token", { signal });
    expect(request).toHaveBeenCalledWith("/api/shifts", "token", { signal });
  });

  it("publishes each successful resource before slower resources settle", async () => {
    const shifts = deferred<{
      items: Array<{ id: string; name: string }>;
      total: number;
      page: number;
      pageSize: number;
    }>();
    const settlements: unknown[] = [];
    let aggregateSettled = false;
    const request = vi.fn((path: string) => {
      if (path === "/api/clients") {
        return Promise.resolve({
          items: [{ id: "client-a", name: "Client A" }],
          total: 1,
          page: 1,
          pageSize: 25
        });
      }
      if (path === "/api/shifts") return shifts.promise;
      return Promise.reject(new Error(`Unexpected request: ${path}`));
    });

    const aggregate = fetchReferenceData({
      token: "token",
      can: (resource, action) =>
        action === "read" && (resource === "clients" || resource === "shifts"),
      signal: new AbortController().signal,
      request: request as unknown as PageRequester,
      onSettled: (settlement) => settlements.push(settlement)
    }).finally(() => {
      aggregateSettled = true;
    });

    await Promise.resolve();
    await Promise.resolve();
    expect(settlements).toEqual([
      expect.objectContaining({
        resource: "clients",
        value: expect.objectContaining({ items: [{ id: "client-a", name: "Client A" }] })
      })
    ]);
    expect(aggregateSettled).toBe(false);

    shifts.resolve({ items: [], total: 0, page: 1, pageSize: 25 });
    await aggregate;
    expect(settlements.map((settlement) => (settlement as { resource: string }).resource)).toEqual([
      "clients",
      "shifts"
    ]);
  });
});

describe("fetchRbacData", () => {
  it("loads the twenty-sixth role and the complete paged permission catalogue", async () => {
    const signal = new AbortController().signal;
    const permissions = Array.from({ length: 100 }, (_, index) => ({
      id: `permission-${index + 1}`,
      resource: "activities",
      action: `action-${index + 1}`
    }));
    const request = vi.fn(async (path: string) => {
      if (path.startsWith("/api/rbac/roles?")) {
        return {
          items: [{ id: "role-26", name: "Role 26", scope: "COMPANY" }],
          total: 26,
          page: 3,
          pageSize: rbacPageSize
        };
      }
      if (path === "/api/rbac/permissions?page=1&pageSize=100") {
        return { items: permissions, total: 101, page: 1, pageSize: 100 };
      }
      if (path === "/api/rbac/permissions?page=2&pageSize=100") {
        return {
          items: [{ id: "permission-101", resource: "teams", action: "read" }],
          total: 101,
          page: 2,
          pageSize: 100
        };
      }
      throw new Error(`Unexpected request: ${path}`);
    });

    const result = await fetchRbacData({
      token: "token",
      can: (resource, action) => resource === "rbac" && action === "read",
      page: 3,
      search: `  ${"x".repeat(220)}  `,
      signal,
      request: request as unknown as PageRequester
    });

    expect(result?.roles.items).toEqual([{ id: "role-26", name: "Role 26", scope: "COMPANY" }]);
    expect(result?.permissions.items).toHaveLength(101);
    expect(result?.permissions.items.at(-1)).toEqual({
      id: "permission-101",
      resource: "teams",
      action: "read"
    });
    const rolePath = String(
      request.mock.calls.find(([path]) => String(path).startsWith("/api/rbac/roles?"))?.[0]
    );
    const roleUrl = new URL(rolePath, "https://shiftflow.local");
    expect(roleUrl.searchParams.get("page")).toBe("3");
    expect(roleUrl.searchParams.get("pageSize")).toBe(String(rbacPageSize));
    expect(roleUrl.searchParams.get("search")).toHaveLength(200);
    expect(request).toHaveBeenCalledWith("/api/rbac/permissions?page=2&pageSize=100", "token", {
      signal
    });
  });

  it("fails closed if the permission catalogue reports a page without progress", async () => {
    const request = vi.fn(async (path: string) => {
      if (path.startsWith("/api/rbac/roles?")) {
        return { items: [], total: 0, page: 1, pageSize: rbacPageSize };
      }
      return { items: [], total: 1, page: 1, pageSize: 100 };
    });

    await expect(
      fetchRbacData({
        token: "token",
        can: (resource, action) => resource === "rbac" && action === "read",
        signal: new AbortController().signal,
        request: request as unknown as PageRequester
      })
    ).rejects.toThrow("Permission catalogue pagination made no progress");
  });
});
