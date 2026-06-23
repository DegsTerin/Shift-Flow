"use client";

import { RotateCcw, Save, Trash2, Plus, X, CheckCircle2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { apiRequest } from "../lib/api";
import type {
  ActivityItem,
  ClientRef,
  CommentItem,
  Locale,
  ModalState,
  RoleRef,
  ShiftRef,
  TeamRef,
  Texts,
  UserRef,
  View
} from "../lib/types";
import {
  activityPayload,
  activityStatuses,
  createRecord,
  formatDateTime,
  priorities,
  recordEndpoint,
  recordPayload,
  shiftStatuses,
  toDateInputValue,
  userOptionLabel,
  userRoleId
} from "../lib/utils";
import { SelectInput } from "./controls";

export function RecordModal({
  state,
  t,
  token,
  locale,
  clients,
  users,
  teams,
  shifts,
  roles,
  onClose,
  onReload
}: {
  state: NonNullable<ModalState>;
  t: Texts;
  token?: string;
  locale: Locale;
  clients: ClientRef[];
  users: UserRef[];
  teams: TeamRef[];
  shifts: ShiftRef[];
  roles: RoleRef[];
  onClose: () => void;
  onReload: () => Promise<void>;
}) {
  const isActivity = state.entity === "activities" || state.entity === "kanban";
  const activity = isActivity && state.record ? (state.record as ActivityItem) : null;
  const recordId =
    typeof state.record === "object" && state.record && "id" in state.record
      ? String((state.record as { id?: string }).id ?? "")
      : "";
  const [editing, setEditing] = useState(state.mode === "create");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setMessage(null);
    try {
      if (state.mode === "create") await createRecord(state.entity, form, token, clients, teams);
      else if (activity)
        await apiRequest<ActivityItem>(`/api/activities/${activity.id}`, token, {
          method: "PATCH",
          body: JSON.stringify(activityPayload(form))
        });
      else if (recordId)
        await apiRequest(recordEndpoint(state.entity, recordId), token, {
          method: "PATCH",
          body: JSON.stringify(recordPayload(state.entity, form, clients, teams))
        });
      await onReload();
      onClose();
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  async function removeActivity() {
    if (!token || (!activity && !recordId)) return;
    setBusy(true);
    try {
      const endpoint = activity
        ? `/api/activities/${activity.id}`
        : recordEndpoint(state.entity, recordId);
      await apiRequest(endpoint, token, { method: "DELETE" });
      await onReload();
      onClose();
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  async function transitionActivity(action: "close" | "reopen") {
    if (!token || !activity) return;
    setBusy(true);
    setMessage(null);
    try {
      await apiRequest<ActivityItem>(`/api/activities/${activity.id}/${action}`, token, {
        method: "POST",
        body: JSON.stringify({
          note:
            action === "close"
              ? "Encerrado pelo modal operacional"
              : "Reaberto pelo modal operacional"
        })
      });
      await onReload();
      onClose();
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  async function addComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !activity) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    try {
      await apiRequest<CommentItem>("/api/comments", token, {
        method: "POST",
        body: JSON.stringify({ activityId: activity.id, body: String(form.get("body") ?? "") })
      });
      await onReload();
      onClose();
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <section className="record-modal">
        <header className="modal-header">
          <div>
            <p className="eyebrow">{state.mode === "create" ? t.newRecord : t.details}</p>
            <h2>{modalTitle(state.entity, t)}</h2>
          </div>
          <button className="icon-button" onClick={onClose} title={t.close}>
            <X size={18} />
          </button>
        </header>
        {message ? (
          <p className="form-error" role="alert">
            {message}
          </p>
        ) : null}
        {state.mode === "create" ? (
          <CreateForm
            entity={state.entity}
            t={t}
            clients={clients}
            users={users}
            teams={teams}
            shifts={shifts}
            roles={roles}
            busy={busy}
            onSubmit={submit}
          />
        ) : null}
        {state.mode === "detail" && activity ? (
          <ActivityDetail
            activity={activity}
            t={t}
            locale={locale}
            clients={clients}
            users={users}
            teams={teams}
            shifts={shifts}
            editing={editing}
            busy={busy}
            setEditing={setEditing}
            onSubmit={submit}
            onRemove={removeActivity}
            onComment={addComment}
            onCloseActivity={() => void transitionActivity("close")}
            onReopenActivity={() => void transitionActivity("reopen")}
          />
        ) : null}
        {state.mode === "detail" && !activity ? (
          <GenericDetail
            entity={state.entity}
            record={state.record}
            t={t}
            roles={roles}
            editing={editing}
            busy={busy}
            setEditing={setEditing}
            onSubmit={submit}
            onRemove={removeActivity}
          />
        ) : null}
      </section>
    </div>
  );
}

function GenericDetail({
  entity,
  record,
  t,
  roles,
  editing,
  busy,
  setEditing,
  onSubmit,
  onRemove
}: {
  entity: View;
  record: unknown;
  t: Texts;
  roles: RoleRef[];
  editing: boolean;
  busy: boolean;
  setEditing: (value: boolean) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onRemove: () => void;
}) {
  if (entity === "users")
    return (
      <UserDetail
        user={record as UserRef & { preferredLocale?: string; preferredTheme?: string }}
        t={t}
        roles={roles}
        editing={editing}
        busy={busy}
        setEditing={setEditing}
        onSubmit={onSubmit}
        onRemove={onRemove}
      />
    );
  if (entity === "clients")
    return (
      <ClientDetail
        client={record as ClientRef}
        t={t}
        editing={editing}
        busy={busy}
        setEditing={setEditing}
        onSubmit={onSubmit}
        onRemove={onRemove}
      />
    );
  if (entity === "teams")
    return (
      <TeamDetail
        team={record as TeamRef & { description?: string }}
        t={t}
        editing={editing}
        busy={busy}
        setEditing={setEditing}
        onSubmit={onSubmit}
        onRemove={onRemove}
      />
    );
  if (entity === "shifts")
    return (
      <ShiftDetail
        shift={record as ShiftRef & { timezone?: string }}
        t={t}
        editing={editing}
        busy={busy}
        setEditing={setEditing}
        onSubmit={onSubmit}
        onRemove={onRemove}
      />
    );
  return <pre className="json-detail">{JSON.stringify(record, null, 2)}</pre>;
}

function FormActions({
  t,
  editing,
  busy,
  setEditing,
  onRemove
}: {
  t: Texts;
  editing: boolean;
  busy: boolean;
  setEditing: (value: boolean) => void;
  onRemove: () => void;
}) {
  return (
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
      <button className="danger-button" disabled={busy} type="button" onClick={onRemove}>
        <Trash2 size={16} />
        {t.delete}
      </button>
    </div>
  );
}

function UserDetail({
  user,
  t,
  roles,
  editing,
  busy,
  setEditing,
  onSubmit,
  onRemove
}: {
  user: UserRef & { preferredLocale?: string; preferredTheme?: string };
  t: Texts;
  roles: RoleRef[];
  editing: boolean;
  busy: boolean;
  setEditing: (value: boolean) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onRemove: () => void;
}) {
  return (
    <form className="modal-grid" onSubmit={onSubmit}>
      <label>
        Nome
        <input
          name="displayName"
          defaultValue={user.displayName ?? ""}
          disabled={!editing}
          required
        />
      </label>
      <label>
        E-mail
        <input
          name="email"
          type="email"
          defaultValue={user.email ?? ""}
          disabled={!editing}
          required
        />
      </label>
      <label>
        Cargo
        <input name="jobTitle" defaultValue={user.jobTitle ?? ""} disabled={!editing} />
      </label>
      <label>
        Status
        <SelectInput
          name="status"
          value={user.status ?? "ACTIVE"}
          disabled={!editing}
          options={[
            ["INVITED", "INVITED"],
            ["ACTIVE", "ACTIVE"],
            ["INACTIVE", "INACTIVE"],
            ["LOCKED", "LOCKED"]
          ]}
        />
      </label>
      <label>
        Perfil
        <SelectInput
          name="roleId"
          value={userRoleId(user) || roles[0]?.id || ""}
          disabled={!editing}
          options={roles.map((role) => [role.id ?? "", role.name ?? "-"])}
        />
      </label>
      <label>
        Idioma
        <SelectInput
          name="preferredLocale"
          value={user.preferredLocale ?? "PT_BR"}
          disabled={!editing}
          options={[
            ["PT_BR", "PT_BR"],
            ["EN_GB", "EN_GB"]
          ]}
        />
      </label>
      <label>
        Tema
        <SelectInput
          name="preferredTheme"
          value={user.preferredTheme ?? "SYSTEM"}
          disabled={!editing}
          options={[
            ["SYSTEM", "SYSTEM"],
            ["LIGHT", "LIGHT"],
            ["DARK", "DARK"]
          ]}
        />
      </label>
      <label className="span-2">
        Nova senha
        <input
          name="password"
          type="password"
          disabled={!editing}
          placeholder="Preencha apenas para alterar"
        />
      </label>
      <FormActions
        t={t}
        editing={editing}
        busy={busy}
        setEditing={setEditing}
        onRemove={onRemove}
      />
    </form>
  );
}

function ClientDetail({
  client,
  t,
  editing,
  busy,
  setEditing,
  onSubmit,
  onRemove
}: {
  client: ClientRef;
  t: Texts;
  editing: boolean;
  busy: boolean;
  setEditing: (value: boolean) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onRemove: () => void;
}) {
  return (
    <form className="modal-grid" onSubmit={onSubmit}>
      <label>
        Nome
        <input name="name" defaultValue={client.name ?? ""} disabled={!editing} required />
      </label>
      <label>
        Codigo
        <input name="code" defaultValue={client.code ?? ""} disabled={!editing} />
      </label>
      <label>
        Status
        <SelectInput
          name="status"
          value={client.status ?? "ACTIVE"}
          disabled={!editing}
          options={[
            ["ACTIVE", "ACTIVE"],
            ["INACTIVE", "INACTIVE"]
          ]}
        />
      </label>
      <FormActions
        t={t}
        editing={editing}
        busy={busy}
        setEditing={setEditing}
        onRemove={onRemove}
      />
    </form>
  );
}

function TeamDetail({
  team,
  t,
  editing,
  busy,
  setEditing,
  onSubmit,
  onRemove
}: {
  team: TeamRef & { description?: string };
  t: Texts;
  editing: boolean;
  busy: boolean;
  setEditing: (value: boolean) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onRemove: () => void;
}) {
  return (
    <form className="modal-grid" onSubmit={onSubmit}>
      <label>
        Nome
        <input name="name" defaultValue={team.name ?? ""} disabled={!editing} required />
      </label>
      <label>
        Cor
        <input name="color" defaultValue={team.color ?? "#0f766e"} disabled={!editing} />
      </label>
      <label>
        SLA
        <input
          name="defaultSlaMinutes"
          type="number"
          defaultValue={team.defaultSlaMinutes ?? 240}
          disabled={!editing}
        />
      </label>
      <label className="span-2">
        Descricao
        <textarea name="description" defaultValue={team.description ?? ""} disabled={!editing} />
      </label>
      <FormActions
        t={t}
        editing={editing}
        busy={busy}
        setEditing={setEditing}
        onRemove={onRemove}
      />
    </form>
  );
}

function ShiftDetail({
  shift,
  t,
  editing,
  busy,
  setEditing,
  onSubmit,
  onRemove
}: {
  shift: ShiftRef & { timezone?: string };
  t: Texts;
  editing: boolean;
  busy: boolean;
  setEditing: (value: boolean) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onRemove: () => void;
}) {
  return (
    <form className="modal-grid" onSubmit={onSubmit}>
      <label>
        Nome
        <input name="name" defaultValue={shift.name ?? ""} disabled={!editing} required />
      </label>
      <label>
        Inicio
        <input
          name="startsAt"
          type="datetime-local"
          defaultValue={shift.startsAt ? shift.startsAt.slice(0, 16) : ""}
          disabled={!editing}
          required
        />
      </label>
      <label>
        Fim
        <input
          name="endsAt"
          type="datetime-local"
          defaultValue={shift.endsAt ? shift.endsAt.slice(0, 16) : ""}
          disabled={!editing}
          required
        />
      </label>
      <label>
        Timezone
        <input
          name="timezone"
          defaultValue={shift.timezone ?? "America/Sao_Paulo"}
          disabled={!editing}
        />
      </label>
      <label>
        Status
        <SelectInput
          name="status"
          value={shift.status ?? "OPEN"}
          disabled={!editing}
          options={shiftStatuses.map((item) => [item, item])}
        />
      </label>
      <FormActions
        t={t}
        editing={editing}
        busy={busy}
        setEditing={setEditing}
        onRemove={onRemove}
      />
    </form>
  );
}

function ActivityDetail({
  activity,
  t,
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

function CreateForm({
  entity,
  t,
  clients,
  users,
  teams,
  shifts,
  roles,
  busy,
  onSubmit
}: {
  entity: View;
  t: Texts;
  clients: ClientRef[];
  users: UserRef[];
  teams: TeamRef[];
  shifts: ShiftRef[];
  roles: RoleRef[];
  busy: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const now = new Date();
  const later = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  if (entity === "users")
    return (
      <form className="modal-grid" onSubmit={onSubmit}>
        <label>
          Nome
          <input name="displayName" required />
        </label>
        <label>
          E-mail
          <input name="email" type="email" required />
        </label>
        <label>
          Cargo
          <input name="jobTitle" />
        </label>
        <label>
          Status
          <SelectInput
            name="status"
            value="ACTIVE"
            options={[
              ["INVITED", "INVITED"],
              ["ACTIVE", "ACTIVE"],
              ["INACTIVE", "INACTIVE"],
              ["LOCKED", "LOCKED"]
            ]}
          />
        </label>
        <label>
          Perfil
          <SelectInput
            name="roleId"
            value={roles.find((role) => role.name === "Operador")?.id ?? roles[0]?.id ?? ""}
            options={roles.map((role) => [role.id ?? "", role.name ?? "-"])}
          />
        </label>
        <label>
          Senha
          <input name="password" type="password" required />
        </label>
        <button className="primary-button span-2" disabled={busy} type="submit">
          <Save size={16} />
          {t.save}
        </button>
      </form>
    );
  if (entity === "clients")
    return (
      <form className="modal-grid" onSubmit={onSubmit}>
        <label>
          Nome
          <input name="name" required />
        </label>
        <label>
          Codigo
          <input name="code" />
        </label>
        <label>
          Status
          <SelectInput
            name="status"
            value="ACTIVE"
            options={[
              ["ACTIVE", "ACTIVE"],
              ["INACTIVE", "INACTIVE"]
            ]}
          />
        </label>
        <button className="primary-button span-2" disabled={busy} type="submit">
          <Save size={16} />
          {t.save}
        </button>
      </form>
    );
  if (entity === "teams")
    return (
      <form className="modal-grid" onSubmit={onSubmit}>
        <label>
          Nome
          <input name="name" required />
        </label>
        <label>
          Cor
          <input name="color" defaultValue="#0f766e" />
        </label>
        <label>
          SLA
          <input name="defaultSlaMinutes" type="number" defaultValue="240" />
        </label>
        <label className="span-2">
          Descricao
          <textarea name="description" />
        </label>
        <button className="primary-button span-2" disabled={busy} type="submit">
          <Save size={16} />
          {t.save}
        </button>
      </form>
    );
  if (entity === "shifts")
    return (
      <form className="modal-grid" onSubmit={onSubmit}>
        <label>
          Nome
          <input name="name" required />
        </label>
        <label>
          Inicio
          <input
            name="startsAt"
            type="datetime-local"
            defaultValue={toDateInputValue(now)}
            required
          />
        </label>
        <label>
          Fim
          <input
            name="endsAt"
            type="datetime-local"
            defaultValue={toDateInputValue(later)}
            required
          />
        </label>
        <label>
          Timezone
          <input name="timezone" defaultValue="America/Sao_Paulo" />
        </label>
        <label>
          Status
          <SelectInput
            name="status"
            value="OPEN"
            options={shiftStatuses.map((item) => [item, item])}
          />
        </label>
        <button className="primary-button span-2" disabled={busy} type="submit">
          <Save size={16} />
          {t.save}
        </button>
      </form>
    );
  return (
    <form className="modal-grid" onSubmit={onSubmit}>
      <label>
        Titulo
        <input name="title" required />
      </label>
      <label>
        Cliente
        <SelectInput
          name="clientId"
          value={clients[0]?.id ?? ""}
          options={clients.map((item) => [item.id ?? "", item.name ?? "-"])}
        />
      </label>
      <label>
        Equipe
        <SelectInput
          name="teamId"
          value={teams[0]?.id ?? ""}
          options={teams.map((item) => [item.id ?? "", item.name ?? "-"])}
        />
      </label>
      <label>
        Turno
        <SelectInput
          name="shiftId"
          value={shifts[0]?.id ?? ""}
          options={shifts.map((item) => [item.id ?? "", item.name ?? "-"])}
        />
      </label>
      <label>
        Analista
        <SelectInput
          name="assigneeId"
          value={users[0]?.id ?? ""}
          options={users.map((item) => [item.id ?? "", userOptionLabel(item)])}
        />
      </label>
      <label>
        Prioridade
        <SelectInput
          name="priority"
          value="MEDIUM"
          options={priorities.map((item) => [item, item])}
        />
      </label>
      <label>
        Status
        <SelectInput
          name="status"
          value="PENDING"
          options={activityStatuses.map((item) => [item, item])}
        />
      </label>
      <label>
        SLA
        <input name="slaDueAt" type="datetime-local" defaultValue={toDateInputValue(later)} />
      </label>
      <label>
        Sistema
        <input name="systemName" />
      </label>
      <label>
        Servico
        <input name="serviceName" />
      </label>
      <OperationalFields />
      <button className="primary-button span-2" disabled={busy} type="submit">
        <Save size={16} />
        {t.save}
      </button>
    </form>
  );
}

function OperationalFields({
  activity,
  disabled = false
}: {
  activity?: ActivityItem;
  disabled?: boolean;
}) {
  return (
    <>
      <label className="span-2">
        O que foi solicitado
        <textarea
          name="requested"
          defaultValue={activity?.requested ?? ""}
          disabled={disabled}
          required={!activity}
        />
      </label>
      <label className="span-2">
        O que foi feito
        <textarea
          name="performed"
          defaultValue={activity?.performed ?? ""}
          disabled={disabled}
          required={!activity}
        />
      </label>
      <label className="span-2">
        O que esta em andamento
        <textarea
          name="inProgressDetail"
          defaultValue={activity?.inProgressDetail ?? ""}
          disabled={disabled}
          required={!activity}
        />
      </label>
      <label className="span-2">
        O que esta pendente
        <textarea
          name="pendingDetail"
          defaultValue={activity?.pendingDetail ?? ""}
          disabled={disabled}
          required={!activity}
        />
      </label>
      <label className="span-2">
        Como foi finalizado
        <textarea
          name="finalizationDetail"
          defaultValue={activity?.finalizationDetail ?? ""}
          disabled={disabled}
          required={!activity}
        />
      </label>
      <label className="span-2">
        Observacoes
        <textarea
          name="observations"
          defaultValue={activity?.observations ?? ""}
          disabled={disabled}
        />
      </label>
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

function modalTitle(entity: View, t: Texts) {
  return t[entity === "team-dashboard" ? "teamDashboard" : entity];
}
