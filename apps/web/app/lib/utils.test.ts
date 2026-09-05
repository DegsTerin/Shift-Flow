// en-GB: Verifies Kanban decisions and role payload semantics at the browser boundary.
import { describe, expect, it } from "vitest";
import { messages } from "./i18n";
import {
  activityPayload,
  hasInvertedDateRange,
  kanbanMoveCommand,
  priorityLabel,
  productAssignableRoles,
  roleUpdatePayload,
  recordPayload,
  shiftPayload,
  shiftCommandsForStatus,
  shiftInitialStatuses,
  slaLabel,
  statusLabel,
  userPayload,
  userRoleId,
  userRoleOptions
} from "./utils";

describe("Shift lifecycle UI contract", () => {
  it("keeps exactly two creation states and preserves the Web OPEN default", () => {
    expect(shiftInitialStatuses).toEqual(["PLANNED", "OPEN"]);
    expect(shiftPayload(new FormData()).status).toBe("OPEN");
    const form = new FormData();
    form.set("status", "PLANNED");
    expect(shiftPayload(form).status).toBe("PLANNED");
  });

  it.each(["CLOSED", "REOPENED", "CANCELLED", "UNKNOWN"])(
    "rejects forged initial status %s",
    (status) => {
      const form = new FormData();
      form.set("status", status);
      expect(() => shiftPayload(form)).toThrow("New shifts must be planned or open");
    }
  );

  it.each([
    { status: "PLANNED", commands: ["open", "close", "cancel"] },
    { status: "OPEN", commands: ["close", "cancel"] },
    { status: "REOPENED", commands: ["close", "cancel"] },
    { status: "CLOSED", commands: ["reopen"] },
    { status: "CANCELLED", commands: [] },
    { status: "UNKNOWN", commands: [] },
    { status: undefined, commands: [] }
  ])("offers only valid commands for $status", ({ status, commands }) => {
    expect(shiftCommandsForStatus(status)).toEqual(commands);
  });

  it("provides matching Shift command labels in both existing locales", () => {
    const keys = ["openShift", "closeShift", "reopenShift", "cancelShift"] as const;
    expect(keys.map((key) => messages["en-GB"][key])).toEqual([
      "Open shift",
      "Close shift",
      "Reopen shift",
      "Cancel shift"
    ]);
    expect(keys.map((key) => messages["pt-BR"][key])).toEqual([
      "Abrir turno",
      "Encerrar turno",
      "Reabrir turno",
      "Cancelar turno"
    ]);
  });
});

describe("activity enum labels", () => {
  it("localises priorities and statuses without changing their canonical values", () => {
    expect(priorityLabel("CRITICAL", messages["pt-BR"])).toBe("Crítica");
    expect(priorityLabel("CRITICAL", messages["en-GB"])).toBe("Critical");
    expect(statusLabel("WAITING_CUSTOMER", messages["pt-BR"])).toBe("Aguardando cliente");
    expect(statusLabel("WAITING_CUSTOMER", messages["en-GB"])).toBe("Waiting for customer");
    expect(priorityLabel("FUTURE_PRIORITY", messages["en-GB"])).toBe("FUTURE_PRIORITY");
  });
});

describe("slaLabel", () => {
  it("localises an elapsed SLA without a hard-coded language", () => {
    const now = new Date("2026-08-28T12:00:00.000Z");
    const clock = Date.now;
    Date.now = () => now.getTime();
    try {
      expect(slaLabel("2026-08-28T11:59:00.000Z", messages["pt-BR"])).toBe("SLA violado");
      expect(slaLabel("2026-08-28T11:59:00.000Z", messages["en-GB"])).toBe("SLA breached");
    } finally {
      Date.now = clock;
    }
  });
});

describe("activityPayload", () => {
  it("omits an unchanged zoned SLA when another field is edited", () => {
    const form = new FormData();
    form.set("title", "Renamed activity");
    form.set("slaDueAt", "2026-08-30T12:00");
    const payload = activityPayload(
      form,
      { id: "activity-a", title: "Activity", slaDueAt: "2026-08-30T15:00:34.987Z" },
      "America/Sao_Paulo"
    );
    expect(JSON.parse(JSON.stringify(payload))).not.toHaveProperty("slaDueAt");
  });

  it("preserves all current references when an unrelated edit omits unloaded selectors", () => {
    const form = new FormData();
    form.set("title", "Renamed activity");

    expect(
      activityPayload(form, {
        id: "activity-a",
        title: "Original activity",
        clientId: "client-26",
        teamId: "team-26",
        shiftId: "shift-26",
        assigneeId: "user-26"
      })
    ).toMatchObject({
      title: "Renamed activity",
      clientId: "client-26",
      teamId: "team-26",
      shiftId: "shift-26",
      assigneeId: "user-26"
    });
  });

  it("allows optional references to be explicitly cleared", () => {
    const form = new FormData();
    form.set("title", "Renamed activity");
    form.set("shiftId", "");
    form.set("assigneeId", "");

    const payload = activityPayload(form, {
      id: "activity-a",
      title: "Original activity",
      clientId: "client-a",
      teamId: "team-a",
      shiftId: "shift-a",
      assigneeId: "user-a"
    });

    expect(JSON.parse(JSON.stringify(payload))).toMatchObject({
      shiftId: null,
      assigneeId: null
    });
  });

  it("serialises explicit text and SLA clearing without copying requested into description", () => {
    const form = new FormData();
    form.set("title", "Renamed activity");
    form.set("description", "");
    form.set("requested", "Original request");
    form.set("systemName", "");
    form.set("serviceName", "");
    form.set("performed", "");
    form.set("inProgressDetail", "");
    form.set("pendingDetail", "");
    form.set("finalizationDetail", "");
    form.set("observations", "");
    form.set("slaDueAt", "");

    const serialised = JSON.parse(
      JSON.stringify(
        activityPayload(form, {
          id: "activity-a",
          title: "Original activity",
          clientId: "client-a",
          teamId: "team-a",
          description: "Previous description",
          requested: "Original request",
          slaDueAt: "2026-08-30T12:00:00.000Z"
        })
      )
    );

    expect(serialised).toMatchObject({
      description: "",
      requested: "Original request",
      systemName: "",
      serviceName: "",
      performed: "",
      inProgressDetail: "",
      pendingDetail: "",
      finalizationDetail: "",
      observations: "",
      slaDueAt: null
    });
  });
});

describe("Shift zoned payload", () => {
  const shift = {
    id: "shift-a",
    name: "Shift",
    startsAt: "2026-08-30T12:00:34.987Z",
    endsAt: "2026-08-30T20:00:56.789Z",
    timezone: "Europe/London"
  };

  it("preserves both instants when only the timezone changes", () => {
    const form = new FormData();
    form.set("name", "Renamed shift");
    form.set("startsAt", "2026-08-30T13:00");
    form.set("endsAt", "2026-08-30T21:00");
    form.set("timezone", "UTC");
    const payload = JSON.parse(JSON.stringify(recordPayload("shifts", form, [], [], shift)));
    expect(payload).toEqual({ name: "Renamed shift", timezone: "UTC" });
  });

  it("sends only the changed bound for resolution in the newly submitted zone", () => {
    const form = new FormData();
    form.set("name", "Shift");
    form.set("startsAt", "2026-08-30T14:00");
    form.set("endsAt", "2026-08-30T21:00");
    form.set("timezone", "UTC");
    expect(JSON.parse(JSON.stringify(recordPayload("shifts", form, [], [], shift)))).toEqual({
      name: "Shift",
      startsAt: "2026-08-30T14:00",
      timezone: "UTC"
    });
  });
});

describe("hasInvertedDateRange", () => {
  it("accepts absent, equal and increasing canonical date-only bounds", () => {
    expect(hasInvertedDateRange({ from: "", to: "" })).toBe(false);
    expect(hasInvertedDateRange({ from: "2026-08-28", to: "" })).toBe(false);
    expect(hasInvertedDateRange({ from: "", to: "2026-08-28" })).toBe(false);
    expect(hasInvertedDateRange({ from: "2026-08-28", to: "2026-08-28" })).toBe(false);
    expect(hasInvertedDateRange({ from: "2026-08-28", to: "2026-08-29" })).toBe(false);
  });

  it("rejects an inverted canonical date-only range without timezone conversion", () => {
    expect(hasInvertedDateRange({ from: "2026-08-28", to: "2026-08-27" })).toBe(true);
  });
});

describe("kanbanMoveCommand", () => {
  const activities = [
    { id: "activity-1", title: "Incident", status: "PENDING" },
    { id: "activity-2", title: "Request", status: "IN_PROGRESS" }
  ];

  it("does not emit a move when a card is dropped in its current status", () => {
    expect(kanbanMoveCommand(activities, "activity-1", "PENDING")).toBeNull();
  });

  it("emits exactly one command for a genuine status change", () => {
    expect(kanbanMoveCommand(activities, "activity-1", "IN_PROGRESS")).toEqual({
      id: "activity-1",
      status: "IN_PROGRESS"
    });
  });

  it("does not emit a move for an absent or unknown dragged card", () => {
    expect(kanbanMoveCommand(activities, null, "DONE")).toBeNull();
    expect(kanbanMoveCommand(activities, "missing", "DONE")).toBeNull();
  });
});

describe("roleUpdatePayload", () => {
  it("does not invent a company scope when the scope control is absent", () => {
    const form = new FormData();
    form.set("name", "Client operator");
    form.set("color", "#0f766e");
    form.set("isActive", "on");

    expect(roleUpdatePayload(form)).toEqual({
      name: "Client operator",
      color: "#0f766e",
      isActive: true,
      description: undefined
    });
  });

  it("preserves an explicitly submitted scope", () => {
    const form = new FormData();
    form.set("name", "Client operator");
    form.set("scope", "CLIENT");

    expect(roleUpdatePayload(form)).toMatchObject({ scope: "CLIENT" });
  });
});

describe("product role assignment", () => {
  it("offers only active company-scoped profiles in the user editor", () => {
    expect(
      productAssignableRoles([
        { id: "company-role", scope: "COMPANY", isActive: true },
        { id: "inactive-role", scope: "COMPANY", isActive: false },
        { id: "client-role", scope: "CLIENT", isActive: true }
      ])
    ).toEqual([{ id: "company-role", scope: "COMPANY", isActive: true }]);
  });

  it("does not present a limited assignment as the editable company profile", () => {
    expect(
      userRoleId({
        roleAssignments: [
          { roleId: "client-role", role: { id: "client-role", scope: "CLIENT" } },
          {
            roleId: "company-role",
            endsAt: null,
            role: { id: "company-role", scope: "COMPANY", isActive: true }
          }
        ]
      })
    ).toBe("company-role");
  });

  it("keeps a limited-only user unassigned in unrelated company-profile edits", () => {
    const user = {
      roleAssignments: [{ roleId: "client-role", role: { id: "client-role", scope: "CLIENT" } }]
    };
    const form = new FormData();
    form.set("displayName", "Limited user");
    form.set("roleId", userRoleId(user));

    expect(userRoleId(user)).toBe("");
    expect(userPayload(form)).not.toHaveProperty("roleId");
  });

  it("offers an empty placeholder only when no company profile is currently assigned", () => {
    const roles = [{ id: "company-role", name: "Operator", scope: "COMPANY" }];
    const companyUser = {
      roleAssignments: [
        {
          roleId: "company-role",
          endsAt: null,
          role: { id: "company-role", scope: "COMPANY", isActive: true }
        }
      ]
    };
    const limitedUser = {
      roleAssignments: [{ roleId: "client-role", role: { id: "client-role", scope: "CLIENT" } }]
    };

    expect(userRoleOptions(companyUser, roles, messages["pt-BR"])).toEqual([
      ["company-role", "Operator"]
    ]);
    expect(userRoleOptions(limitedUser, roles, messages["pt-BR"])).toEqual([
      ["", "Sem perfil de empresa"],
      ["company-role", "Operator"]
    ]);
  });

  it("does not widen a dimension-limited company role through the simple editor", () => {
    const user = {
      roleAssignments: [
        {
          roleId: "dimensioned-role",
          clientId: "client-a",
          role: { id: "dimensioned-role", scope: "COMPANY", isActive: true }
        }
      ]
    };

    expect(userRoleId(user)).toBe("");
    expect(userRoleOptions(user, [], messages["pt-BR"])).toEqual([["", "Sem perfil de empresa"]]);
  });

  it("preserves an active current company role that is outside the loaded role page", () => {
    const user = {
      roleAssignments: [
        {
          roleId: "current-role",
          endsAt: null,
          role: {
            id: "current-role",
            name: "Current operator",
            scope: "COMPANY",
            isActive: true
          }
        }
      ]
    };

    expect(userRoleOptions(user, [], messages["pt-BR"])).toEqual([
      ["current-role", "Current operator (atual)"]
    ]);
  });

  it("preserves a time-bounded company role outside the simple editor", () => {
    const user = {
      roleAssignments: [
        {
          roleId: "temporary-role",
          endsAt: "2030-01-01T00:00:00.000Z",
          role: { id: "temporary-role", scope: "COMPANY", isActive: true }
        }
      ]
    };

    expect(userRoleId(user)).toBe("");
    expect(userRoleOptions(user, [], messages["pt-BR"])).toEqual([["", "Sem perfil de empresa"]]);
  });

  it("does not submit an inactive company role during unrelated edits", () => {
    const user = {
      roleAssignments: [
        {
          roleId: "inactive-role",
          role: { id: "inactive-role", scope: "COMPANY", isActive: false }
        }
      ]
    };

    expect(userRoleId(user)).toBe("");
    expect(userRoleOptions(user, [], messages["pt-BR"])).toEqual([["", "Sem perfil de empresa"]]);
  });
});
