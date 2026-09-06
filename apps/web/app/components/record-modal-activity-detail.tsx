// en-GB: Renders the record modal activity detail interface so its behaviour and accessible structure stay reusable.
import { CheckCircle2, Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import type { FormEvent } from "react";
import type {
  ActivityItem,
  ClientRef,
  Locale,
  RecordModalCapabilities,
  ReferenceAccess,
  ShiftRef,
  TeamRef,
  Texts,
  UserRef
} from "../lib/types";
import { activityHistoryText, activityHistoryTypeLabel } from "../lib/history-labels";
import { isNamedTimezone, zonedDateInputValue } from "../lib/zoned-datetime";
import {
  activityStatuses,
  formatDateTime,
  priorities,
  priorityLabel,
  statusLabel,
  userOptionLabel
} from "../lib/utils";
import { ReferenceSelectInput, SelectInput } from "./controls";
import { OperationalFields } from "./record-modal-create-form";
import { InternalTaskBoard, type TaskBoardMutationRunner } from "./record-modal-task-board";

export function ActivityDetail({
  activity,
  t,
  token,
  locale,
  companyTimezone,
  clients,
  users,
  teams,
  shifts,
  editing,
  busy,
  capabilities,
  referenceAccess = {
    clients: false,
    users: false,
    teams: false,
    shifts: false,
    roles: false
  },
  setEditing,
  onSubmit,
  onRemove,
  onComment,
  onCloseActivity,
  onReopenActivity,
  runTaskBoardMutation
}: {
  activity: ActivityItem;
  t: Texts;
  token?: string;
  locale: Locale;
  companyTimezone?: string;
  clients: ClientRef[];
  users: UserRef[];
  teams: TeamRef[];
  shifts: ShiftRef[];
  editing: boolean;
  busy: boolean;
  capabilities: RecordModalCapabilities;
  referenceAccess?: ReferenceAccess;
  setEditing: (value: boolean) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onRemove: () => void;
  onComment: (event: FormEvent<HTMLFormElement>) => void;
  onCloseActivity: () => void;
  onReopenActivity: () => void;
  runTaskBoardMutation: TaskBoardMutationRunner;
}) {
  return (
    <>
      <form className="modal-grid" onSubmit={onSubmit}>
        <label>
          {t.title}
          <input
            name="title"
            defaultValue={activity.title}
            disabled={!editing || !capabilities.canWrite}
            required
          />
        </label>
        <div className="reference-field">
          <span>{t.filterClient}</span>
          <ReferenceSelectInput
            t={t}
            label={t.filterClient}
            name="clientId"
            value={activity.clientId ?? activity.client?.id ?? ""}
            selectedLabel={activity.client?.name ?? activity.clientId ?? ""}
            disabled={!editing || !capabilities.canWrite}
            initialItems={clients}
            resource="clients"
            token={token}
            loadEnabled={referenceAccess.clients}
            required
          />
        </div>
        <div className="reference-field">
          <span>{t.filterTeam}</span>
          <ReferenceSelectInput
            t={t}
            label={t.filterTeam}
            name="teamId"
            value={activity.teamId ?? activity.team?.id ?? ""}
            selectedLabel={activity.team?.name ?? activity.teamId ?? ""}
            disabled={!editing || !capabilities.canWrite}
            initialItems={teams}
            resource="teams"
            token={token}
            loadEnabled={referenceAccess.teams}
            required
          />
        </div>
        <div className="reference-field">
          <span>{t.filterShift}</span>
          <ReferenceSelectInput
            t={t}
            label={t.filterShift}
            name="shiftId"
            value={activity.shiftId ?? activity.shift?.id ?? ""}
            selectedLabel={activity.shift?.name ?? activity.shiftId ?? ""}
            disabled={!editing || !capabilities.canWrite}
            initialItems={shifts}
            resource="shifts"
            token={token}
            loadEnabled={referenceAccess.shifts}
            placeholder={t.none}
          />
        </div>
        <div className="reference-field">
          <span>{t.filterAnalyst}</span>
          <ReferenceSelectInput
            t={t}
            label={t.filterAnalyst}
            name="assigneeId"
            value={activity.assigneeId ?? activity.assignee?.id ?? ""}
            selectedLabel={
              activity.assignee ? userOptionLabel(activity.assignee) : (activity.assigneeId ?? "")
            }
            disabled={!editing || !capabilities.canWrite}
            initialItems={users}
            resource="users"
            token={token}
            loadEnabled={referenceAccess.users}
            placeholder={t.unassigned}
          />
        </div>
        <label>
          {t.filterPriority}
          <SelectInput
            name="priority"
            value={activity.priority ?? "MEDIUM"}
            disabled={!editing || !capabilities.canWrite}
            options={priorities.map((item) => [item, priorityLabel(item, t)])}
          />
        </label>
        <label>
          {t.filterStatus}
          <SelectInput
            name="status"
            value={activity.status ?? "PENDING"}
            disabled={!editing || !capabilities.canWrite}
            options={activityStatuses.map((item) => [item, statusLabel(item, t)])}
          />
        </label>
        <label>
          SLA{isNamedTimezone(companyTimezone) ? ` (${companyTimezone})` : ""}
          <input
            name="slaDueAt"
            type="datetime-local"
            step={60}
            defaultValue={zonedDateInputValue(activity.slaDueAt, companyTimezone)}
            disabled={!editing || !capabilities.canWrite || !isNamedTimezone(companyTimezone)}
          />
        </label>
        {!isNamedTimezone(companyTimezone) ? (
          <p className="guard-note span-2">{t.timeZoneUnavailable}</p>
        ) : null}
        <label>
          {t.system}
          <input
            name="systemName"
            defaultValue={activity.systemName ?? ""}
            disabled={!editing || !capabilities.canWrite}
          />
        </label>
        <label>
          {t.service}
          <input
            name="serviceName"
            defaultValue={activity.serviceName ?? ""}
            disabled={!editing || !capabilities.canWrite}
          />
        </label>
        <label className="span-2">
          {t.activityDetail}
          <textarea
            name="description"
            defaultValue={activity.description ?? ""}
            disabled={!editing || !capabilities.canWrite}
          />
        </label>
        <OperationalFields
          activity={activity}
          t={t}
          disabled={!editing || !capabilities.canWrite}
        />
        <div className="modal-actions span-2">
          {capabilities.canWrite ? (
            <button className="compact-button" type="button" onClick={() => setEditing(!editing)}>
              <Save size={16} />
              {editing ? t.close : t.edit}
            </button>
          ) : null}
          {editing && capabilities.canWrite ? (
            <button className="primary-button" disabled={busy} type="submit">
              <Save size={16} />
              {t.save}
            </button>
          ) : null}
          {capabilities.canWrite ? (
            <>
              <button
                className="compact-button"
                disabled={busy || activity.status === "DONE"}
                type="button"
                onClick={onCloseActivity}
              >
                <CheckCircle2 size={16} />
                {t.closeActivity}
              </button>
              <button
                className="compact-button"
                disabled={busy || activity.status !== "DONE"}
                type="button"
                onClick={onReopenActivity}
              >
                <RotateCcw size={16} />
                {t.reopenActivity}
              </button>
            </>
          ) : null}
          {capabilities.canDelete ? (
            <button className="danger-button" disabled={busy} type="button" onClick={onRemove}>
              <Trash2 size={16} />
              {t.delete}
            </button>
          ) : null}
        </div>
      </form>
      <section className="detail-grid">
        <InternalTaskBoard
          activityId={activity.id}
          t={t}
          token={token}
          users={users}
          attachments={activity.attachments ?? []}
          locale={locale}
          busy={busy}
          canWrite={capabilities.canWrite}
          canDelete={capabilities.canDelete}
          canLoadUsers={referenceAccess.users}
          runTaskBoardMutation={runTaskBoardMutation}
        />
        <InfoPanel
          title={t.responsible}
          rows={[
            [t.creator, activity.reporter?.displayName ?? "-"],
            [t.responsible, activity.assignee?.displayName ?? "-"],
            [t.filterTeam, activity.team?.name ?? "-"],
            [t.system, activity.systemName ?? "-"],
            [t.service, activity.serviceName ?? "-"]
          ]}
        />
        <InfoPanel
          title={t.importantDates}
          rows={[
            [t.created, formatDateTime(activity.createdAt, locale)],
            [t.updated, formatDateTime(activity.updatedAt, locale)],
            [
              "SLA",
              activity.slaDueAt && isNamedTimezone(companyTimezone)
                ? `${formatDateTime(activity.slaDueAt, locale, companyTimezone)} (${companyTimezone})`
                : "-"
            ]
          ]}
        />
        <InfoPanel
          title={t.audit}
          rows={[
            [t.createdBy, activity.reporter?.displayName ?? "-"],
            [t.creationDate, formatDateTime(activity.createdAt, locale)],
            [t.lastChanged, formatDateTime(activity.updatedAt, locale)],
            ["ID", activity.id]
          ]}
        />
        <article className="panel">
          <div className="panel-header">
            <h2>{t.history}</h2>
          </div>
          <div className="timeline">
            {(activity.history ?? []).map((item) => (
              <div key={item.id}>
                <strong>{activityHistoryTypeLabel(item.type, t)}</strong>
                <span>
                  {formatDateTime(item.createdAt, locale)} - {item.actor?.displayName ?? "-"}
                </span>
                <small>{activityHistoryText(item, t)}</small>
              </div>
            ))}
          </div>
        </article>
        <article className="panel">
          <div className="panel-header">
            <h2>{t.comments}</h2>
          </div>
          {capabilities.canComment ? (
            <form className="comment-form" onSubmit={onComment}>
              <input aria-label={t.addComment} name="body" placeholder={t.comments} required />
              <button
                aria-label={t.addComment}
                className="compact-button"
                disabled={busy}
                title={t.addComment}
                type="submit"
              >
                <Plus size={16} />
              </button>
            </form>
          ) : null}
          <div className="timeline">
            {(activity.comments ?? []).map((item) => (
              <div key={item.id}>
                <strong>{item.author?.displayName ?? "-"}</strong>
                <span>{formatDateTime(item.createdAt, locale)}</span>
                <small>{item.body}</small>
              </div>
            ))}
          </div>
        </article>
        <article className="panel">
          <div className="panel-header">
            <h2>{t.attachments}</h2>
          </div>
          <div className="timeline">
            {(activity.attachments ?? []).length ? (
              activity.attachments?.map((item) => (
                <div key={item.id ?? item.fileName}>
                  <strong>{item.fileName ?? "-"}</strong>
                  <span>
                    {item.mimeType ?? "-"} - {item.byteSize ?? "-"} bytes
                  </span>
                  <small>{formatDateTime(item.createdAt, locale)}</small>
                </div>
              ))
            ) : (
              <div>
                <strong>{t.attachments}</strong>
                <span>{t.noAttachments}</span>
              </div>
            )}
          </div>
        </article>
      </section>
    </>
  );
}

function InfoPanel({ title, rows }: { title: string; rows: string[][] }) {
  return (
    <article className="panel">
      <div className="panel-header">
        <h2>{title}</h2>
      </div>
      <dl className="info-list">
        {rows.map(([key, value]) => (
          <div key={key}>
            <dt>{key}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </article>
  );
}
