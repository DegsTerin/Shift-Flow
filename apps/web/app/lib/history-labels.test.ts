// en-GB: Verifies locale-aware history presentation without rewriting human-authored notes.
import { describe, expect, it } from "vitest";
import {
  activityHistoryText,
  activityHistoryTypeLabel,
  taskHistoryText,
  taskHistoryTypeLabel
} from "./history-labels";
import { messages } from "./i18n";

describe("history labels", () => {
  it("localises structured activity types, statuses and priorities", () => {
    expect(activityHistoryTypeLabel("STATUS_CHANGED", messages["pt-BR"])).toBe(
      "Alteração de status"
    );
    expect(activityHistoryTypeLabel("STATUS_CHANGED", messages["en-GB"])).toBe("Status changed");
    expect(
      activityHistoryText(
        { id: "history-a", type: "STATUS_CHANGED", fromStatus: "PENDING", toStatus: "DONE" },
        messages["pt-BR"]
      )
    ).toBe("Pendente -> Finalizada");
    expect(
      activityHistoryText(
        {
          id: "history-b",
          type: "PRIORITY_CHANGED",
          fromPriority: "LOW",
          toPriority: "CRITICAL"
        },
        messages["en-GB"]
      )
    ).toBe("Low -> Critical");
  });

  it("localises known legacy automatic notes but preserves human notes", () => {
    expect(
      activityHistoryText(
        { id: "history-a", type: "CLOSED", note: "Encerrado pelo modal operacional" },
        messages["en-GB"]
      )
    ).toBe("Closed");
    expect(
      taskHistoryText(
        { id: "history-b", type: "MOVED", note: "Movido no Kanban interno" },
        messages["en-GB"]
      )
    ).toBe("A movement was recorded.");
    expect(
      activityHistoryText(
        { id: "history-c", type: "UPDATED", note: "Keep this operator note" },
        messages["pt-BR"]
      )
    ).toBe("Keep this operator note");
  });

  it("does not treat null task positions as evidence of movement", () => {
    expect(taskHistoryTypeLabel("ARCHIVED", messages["pt-BR"])).toBe("Arquivamento de tarefa");
    expect(
      taskHistoryText(
        {
          id: "history-a",
          type: "UPDATED",
          fromPosition: null,
          toPosition: null,
          fromColumnId: null,
          toColumnId: null
        },
        messages["en-GB"]
      )
    ).toBe("A change was recorded.");
  });

  it("describes a legacy activity without details as a generic change", () => {
    expect(activityHistoryText({ id: "history-legacy", type: "CREATED" }, messages["en-GB"])).toBe(
      messages["en-GB"].historyChangeRecorded
    );
  });
});
