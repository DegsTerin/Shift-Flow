// en-GB: Checks actual form HTML for explicit timezone context and safe datetime defaults.
import { createElement } from "react";
import type { ReactNode } from "react";
import { createRequire } from "node:module";
import { afterEach, describe, expect, it, vi } from "vitest";
import { messages } from "../lib/i18n";
import { CreateForm } from "./record-modal-create-form";
import { ActivityDetail } from "./record-modal-activity-detail";
import { GenericDetail } from "./record-modal-generic-detail";

// The runtime is already installed; this test needs only its synchronous HTML renderer.
const { renderToStaticMarkup } = createRequire(import.meta.url)("react-dom/server") as {
  renderToStaticMarkup: (node: ReactNode) => string;
};

const common = {
  t: messages["en-GB"],
  clients: [],
  users: [],
  teams: [],
  shifts: [],
  roles: [],
  busy: false,
  onSubmit: vi.fn()
};
const capabilities = {
  canWrite: true,
  canDelete: false,
  canComment: false,
  canAddMembers: false,
  canRemoveMembers: false
};

function input(html: string, name: string) {
  const tag = html.match(new RegExp(`<input\\b[^>]*\\bname="${name}"[^>]*>`))?.[0];
  if (!tag) throw new Error(`Missing input ${name}`);
  return tag;
}

afterEach(() => vi.useRealTimers());

describe("zoned temporal form HTML", () => {
  it("offers only PLANNED and OPEN on creation, with OPEN selected", () => {
    const html = renderToStaticMarkup(
      createElement(CreateForm, { ...common, entity: "shifts", companyTimezone: "UTC" })
    );
    const status = html.match(/<select\b[^>]*name="status"[^>]*>[\s\S]*?<\/select>/)?.[0];
    expect(status).toBeDefined();
    expect(status).toContain('value="PLANNED"');
    expect(status).toMatch(/<option(?=[^>]*value="OPEN")(?=[^>]*selected="")[^>]*>/);
    for (const terminal of ["CLOSED", "REOPENED", "CANCELLED"])
      expect(status).not.toContain(terminal);
  });
  it("initialises new shifts and SLA in the Company zone, not the browser zone", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-30T15:00:34.987Z"));
    const shift = renderToStaticMarkup(
      createElement(CreateForm, {
        ...common,
        entity: "shifts",
        companyTimezone: "America/Sao_Paulo"
      })
    );
    expect(input(shift, "startsAt")).toContain('value="2026-08-30T12:00"');
    expect(input(shift, "endsAt")).toContain('value="2026-08-30T20:00"');
    expect(input(shift, "timezone")).toContain('value="America/Sao_Paulo"');
    expect(input(shift, "startsAt")).toContain('step="60"');
    const activity = renderToStaticMarkup(
      createElement(CreateForm, {
        ...common,
        entity: "activities",
        companyTimezone: "America/Sao_Paulo"
      })
    );
    expect(input(activity, "slaDueAt")).toContain('value="2026-08-30T20:00"');
    expect(activity).toContain("SLA (America/Sao_Paulo)");
  });

  it.each([undefined, "Invalid/Zone"])(
    "does not invent a Company zone for %s",
    (companyTimezone) => {
      const activity = renderToStaticMarkup(
        createElement(CreateForm, { ...common, entity: "activities", companyTimezone })
      );
      expect(input(activity, "slaDueAt")).toContain('disabled=""');
      expect(input(activity, "slaDueAt")).toContain('value=""');
      expect(activity).toContain(messages["en-GB"].timeZoneUnavailable);
    }
  );

  it("renders SLA in its known Company zone with minute precision", () => {
    const html = renderToStaticMarkup(
      createElement(ActivityDetail, {
        ...common,
        activity: { id: "activity-a", title: "Activity A", slaDueAt: "2026-08-30t15:00:34.987z" },
        locale: "en-GB",
        companyTimezone: "America/Sao_Paulo",
        editing: true,
        capabilities,
        setEditing: vi.fn(),
        onRemove: vi.fn(),
        onComment: vi.fn(),
        onCloseActivity: vi.fn(),
        onReopenActivity: vi.fn(),
        runTaskBoardMutation: vi.fn(async () => "IGNORED" as const)
      })
    );
    expect(input(html, "slaDueAt")).toContain('value="2026-08-30T12:00"');
    expect(input(html, "slaDueAt")).not.toContain('disabled=""');
    expect(html).toContain("30/08/2026, 12:00 (America/Sao_Paulo)");
  });

  it.each([undefined, "Invalid/Zone"])(
    "does not invent an SLA summary clock for %s",
    (companyTimezone) => {
      const html = renderToStaticMarkup(
        createElement(ActivityDetail, {
          ...common,
          activity: { id: "activity-a", title: "Activity A", slaDueAt: "2026-08-30T15:00:34.987Z" },
          locale: "en-GB",
          companyTimezone,
          editing: true,
          capabilities,
          setEditing: vi.fn(),
          onRemove: vi.fn(),
          onComment: vi.fn(),
          onCloseActivity: vi.fn(),
          onReopenActivity: vi.fn(),
          runTaskBoardMutation: vi.fn(async () => "IGNORED" as const)
        })
      );
      expect(input(html, "slaDueAt")).toContain('disabled=""');
      expect(html).not.toContain("15:00");
      expect(html).not.toContain("12:00");
      expect(html).toContain(messages["en-GB"].timeZoneUnavailable);
    }
  );

  it("uses a Shift's own zone and explains timezone-only edits", () => {
    const html = renderToStaticMarkup(
      createElement(GenericDetail, {
        ...common,
        entity: "shifts",
        record: {
          id: "shift-a",
          name: "Shift A",
          startsAt: "2026-08-30T12:00:34.987Z",
          endsAt: "2026-08-30T20:00:56.789Z",
          timezone: "Europe/London",
          status: "OPEN"
        },
        editing: true,
        capabilities,
        setEditing: vi.fn(),
        onRemove: vi.fn(),
        onAddTeamMember: vi.fn(async () => undefined),
        onRemoveTeamMember: vi.fn(async () => undefined)
      })
    );
    expect(input(html, "startsAt")).toContain('value="2026-08-30T13:00"');
    expect(input(html, "endsAt")).toContain('value="2026-08-30T21:00"');
    expect(html).toContain(messages["en-GB"].shiftTimeZoneHint);
  });
});
