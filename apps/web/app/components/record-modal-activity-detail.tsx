import { CheckCircle2, Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import type { FormEvent } from "react";
import type {
  ActivityItem,
  ClientRef,
  Locale,
  ShiftRef,
  TeamRef,
  Texts,
  UserRef
} from "../lib/types";
import { activityStatuses, formatDateTime, priorities, userOptionLabel } from "../lib/utils";
import { SelectInput } from "./controls";
import { OperationalFields } from "./record-modal-create-form";
import { InternalTaskBoard } from "./record-modal-task-board";

export function ActivityDetail({
  activity,
  t,
  token,
  locale,
  clients,
  users,
  teams,
  shifts,
  editing,
  busy,
  setEditing,
  onSubmit,
  onRemove,
  onComment,
  onCloseActivity,
  onReopenActivity
}: {
  activity: ActivityItem;
  t: Texts;
  token?: string;
  locale: Locale;
  clients: ClientRef[];
  users: UserRef[];
  teams: TeamRef[];
  shifts: ShiftRef[];
  editing: boolean;
  busy: boolean;
  setEditing: (value: boolean) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onRemove: () => void;
  onComment: (event: FormEvent<HTMLFormElement>) => void;
  onCloseActivity: () => void;
  onReopenActivity: () => void;
}) {
  return (
    <>
      <form className="modal-grid" onSubmit={onSubmit}>
        <label>
          Titulo
          <input name="title" defaultValue={activity.title} disabled={!editing} required />
        </label>
        <label>
          Cliente
          <SelectInput
            name="clientId"
            value={activity.clientId ?? activity.client?.id ?? ""}
            disabled={!editing}
            options={clients.map((item) => [item.id ?? "", item.name ?? "-"])}
          />
        </label>
        <label>
          Equipe
          <SelectInput
            name="teamId"
            value={activity.teamId ?? activity.team?.id ?? ""}
            disabled={!editing}
            options={teams.map((item) => [item.id ?? "", item.name ?? "-"])}
          />
        </label>
        <label>
          Turno
          <SelectInput
            name="shiftId"
            value={activity.shiftId ?? activity.shift?.id ?? ""}
            disabled={!editing}
            options={shifts.map((item) => [item.id ?? "", item.name ?? "-"])}
          />
        </label>
        <label>
          Analista
          <SelectInput
            name="assigneeId"
            value={activity.assigneeId ?? activity.assignee?.id ?? ""}
            disabled={!editing}
            options={users.map((item) => [item.id ?? "", userOptionLabel(item)])}
          />
        </label>
        <label>
          Prioridade
          <SelectInput
            name="priority"
            value={activity.priority ?? "MEDIUM"}
            disabled={!editing}
            options={priorities.map((item) => [item, item])}
          />
        </label>
        <label>
          Status
          <SelectInput
            name="status"
            value={activity.status ?? "PENDING"}
            disabled={!editing}
            options={activityStatuses.map((item) => [item, item])}
          />
        </label>
        <label>
          SLA
          <input
            name="slaDueAt"
            type="datetime-local"
            defaultValue={activity.slaDueAt ? activity.slaDueAt.slice(0, 16) : ""}
            disabled={!editing}
          />
        </label>
        <label>
          Sistema
          <input name="systemName" defaultValue={activity.systemName ?? ""} disabled={!editing} />
        </label>
        <label>
          Servico
          <input name="serviceName" defaultValue={activity.serviceName ?? ""} disabled={!editing} />
        </label>
        <label className="span-2">
          Detalhe da atividade
          <textarea
            name="description"
            defaultValue={activity.description ?? ""}
            disabled={!editing}
          />
        </label>
        <OperationalFields activity={activity} disabled={!editing} />
        <div className="modal-actions span-2">
          <button className="compact-button" type="button" onClick={() => setEditing(!editing)}>
            <Save size={16} />
            {editing ? t.close : t.edit}
          </button>
          {editing ? (
            <button className="primary-button" disabled={busy} type="submit">
              <Save size={16} />
              {t.save}
            </button>
          ) : null}
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
          <button className="danger-button" disabled={busy} type="button" onClick={onRemove}>
            <Trash2 size={16} />
            {t.delete}
          </button>
        </div>
      </form>
      <section className="detail-grid">
        <InternalTaskBoard
          activityId={activity.id}
          token={token}
          users={users}
          attachments={activity.attachments ?? []}
          locale={locale}
          busy={busy}
        />
        <InfoPanel
          title={t.responsible}
          rows={[
            ["Criador", activity.reporter?.displayName ?? "-"],
            ["Responsavel", activity.assignee?.displayName ?? "-"],
            ["Equipe", activity.team?.name ?? "-"],
            ["Sistema", activity.systemName ?? "-"],
            ["Servico", activity.serviceName ?? "-"]
          ]}
        />
        <InfoPanel
          title={t.importantDates}
          rows={[
            ["Criacao", formatDateTime(activity.createdAt, locale)],
            ["Atualizacao", formatDateTime(activity.updatedAt, locale)],
            ["SLA", formatDateTime(activity.slaDueAt, locale)]
          ]}
        />
        <InfoPanel
          title="Auditoria"
          rows={[
            ["Criado por", activity.reporter?.displayName ?? "-"],
            ["Data criacao", formatDateTime(activity.createdAt, locale)],
            ["Ultima alteracao", formatDateTime(activity.updatedAt, locale)],
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
                <strong>{item.type}</strong>
                <span>
                  {formatDateTime(item.createdAt, locale)} - {item.actor?.displayName ?? "-"}
                </span>
                <small>{historyText(item)}</small>
              </div>
            ))}
          </div>
        </article>
        <article className="panel">
          <div className="panel-header">
            <h2>{t.comments}</h2>
          </div>
          <form className="comment-form" onSubmit={onComment}>
            <input name="body" placeholder={t.comments} required />
            <button className="compact-button" disabled={busy} type="submit">
              <Plus size={16} />
            </button>
          </form>
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

function historyText(item: {
  note?: string;
  fromStatus?: string;
  toStatus?: string;
  fromPriority?: string;
  toPriority?: string;
  metadata?: unknown;
}) {
  if (item.note) return item.note;
  const statusChange = [item.fromStatus, item.toStatus].filter(Boolean).join(" -> ");
  if (statusChange) return statusChange;
  const priorityChange = [item.fromPriority, item.toPriority].filter(Boolean).join(" -> ");
  if (priorityChange) return priorityChange;
  if (item.metadata) return "Alteracao registrada com valores anteriores e novos.";
  return "Movimentacao registrada.";
}
