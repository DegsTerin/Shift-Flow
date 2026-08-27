// en-GB: Exercises activity query and evidence shaping without a database runtime.
import { describe, expect, it, vi } from "vitest";
import type { ApiRequest } from "../../shared/http/request-types.js";
import type { ActivitiesRepository } from "./activities.repository.js";
import {
  ActivitiesService,
  activityHistoryDelta,
  activityHistorySnapshot
} from "./activities.service.js";

const companyId = "c40e2a7b-72a8-4aca-a780-d6d239134d38";

function request(query: Record<string, unknown> = {}) {
  return { query, auth: { id: "user-1", email: "owner@example.com", companyId } } as ApiRequest;
}

function serviceWith(repository: Partial<ActivitiesRepository>) {
  return new ActivitiesService(repository as ActivitiesRepository);
}

describe("ActivitiesService", () => {
  it("honours requested pagination and combines attention with explicit filters", async () => {
    const filteredList = vi.fn().mockResolvedValue({ items: [], total: 0, page: 2, pageSize: 10 });
    const service = serviceWith({ filteredList } as Partial<ActivitiesRepository>);

    await service.list(
      request({ page: "2", pageSize: "10", priority: "LOW", attention: "CRITICAL" })
    );

    expect(filteredList).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId,
        priority: "LOW",
        AND: [{ priority: "CRITICAL" }]
      }),
      { page: 2, pageSize: 10 }
    );
  });

  it("preserves the legacy list window when pagination is omitted", async () => {
    const filteredList = vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 100 });
    const service = serviceWith({ filteredList } as Partial<ActivitiesRepository>);

    await service.list(request());

    expect(filteredList).toHaveBeenCalledWith(expect.any(Object), { page: 1, pageSize: 100 });
  });

  it("preserves exact millisecond date boundaries produced by validation", async () => {
    const from = new Date("2026-08-01T00:00:00.123Z");
    const to = new Date("2026-08-31T23:59:59.987Z");
    const filteredList = vi.fn().mockResolvedValue({ items: [], total: 0 });
    const service = serviceWith({ filteredList } as Partial<ActivitiesRepository>);

    await service.list(request({ from, to }));

    expect(filteredList).toHaveBeenCalledWith(
      expect.objectContaining({ createdAt: { gte: from, lte: to } }),
      expect.any(Object)
    );
  });

  it("uses a public attachment projection for activity detail", async () => {
    const findById = vi.fn().mockResolvedValue({ id: "activity-1" });
    const service = serviceWith({ findById } as Partial<ActivitiesRepository>);

    await service.get(request(), "activity-1");

    expect(findById).toHaveBeenCalledWith(
      "activity-1",
      companyId,
      expect.objectContaining({
        comments: expect.objectContaining({
          include: { author: expect.any(Object) }
        }),
        attachments: expect.objectContaining({
          where: { deletedAt: null },
          select: {
            id: true,
            fileName: true,
            mimeType: true,
            byteSize: true,
            createdAt: true
          }
        })
      }),
      true
    );
  });

  it("propagates a validated close note to the lifecycle command", async () => {
    const service = serviceWith({} as Partial<ActivitiesRepository>);
    const move = vi.spyOn(service, "move").mockResolvedValue({ id: "activity-1" });

    await service.close(request(), "activity-1", "Closed after owner verification");

    expect(move).toHaveBeenCalledWith(
      expect.any(Object),
      "activity-1",
      "DONE",
      "Closed after owner verification"
    );
  });
});

describe("activity history shaping", () => {
  it("keeps only scalar allowlisted fields and makes them JSON-safe", () => {
    const snapshot = activityHistorySnapshot({
      id: "activity-1",
      title: "Incident",
      updatedAt: new Date("2026-08-27T12:00:00.000Z"),
      comments: [{ body: "must not be copied" }],
      attachments: [{ byteSize: 99n }],
      history: [{ metadata: { history: ["recursive"] } }]
    });

    expect(snapshot).toEqual({
      id: "activity-1",
      title: "Incident",
      updatedAt: "2026-08-27T12:00:00.000Z"
    });
    expect(() => JSON.stringify(snapshot)).not.toThrow();
  });

  it("records only fields that actually changed", () => {
    expect(
      activityHistoryDelta(
        { id: "activity-1", title: "Before", status: "PENDING", comments: ["ignored"] },
        { id: "activity-1", title: "After", status: "PENDING", history: ["ignored"] }
      )
    ).toEqual({
      before: { title: "Before" },
      after: { title: "After" }
    });
  });
});
