"use client";

import {
  Archive,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Plus,
  RotateCcw,
  Save,
  Trash2,
  X
} from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { apiRequest } from "../lib/api";
import type {
  ActivityItem,
  ActivityTaskBoard,
  ActivityTaskItem,
  AttachmentItem,
  ClientRef,
  CommentItem,
  Locale,
  ModalState,
  RoleRef,
  ShiftRef,
  TeamMemberRole,
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
  userOptionLabel,
  userRoleId
} from "../lib/utils";
import { SelectInput } from "./controls";
import { CreateForm, OperationalFields } from "./record-modal-create-form";

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

  useEffect(() => {
    document.body.classList.add("modal-open");
    return () => document.body.classList.remove("modal-open");
  }, []);

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

  async function addTeamMember(teamId: string, userId: string, role: TeamMemberRole) {
    if (!token || !teamId || !userId) return;
    setBusy(true);
    setMessage(null);
    try {
      await apiRequest(`/api/teams/${teamId}/members`, token, {
        method: "POST",
        body: JSON.stringify({ userId, role })
      });
      await onReload();
      onClose();
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  async function removeTeamMember(teamId: string, userId: string) {
    if (!token || !teamId || !userId) return;
    setBusy(true);
    setMessage(null);
    try {
      await apiRequest(`/api/teams/${teamId}/members/${userId}`, token, { method: "DELETE" });
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
            token={token}
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
            users={users}
            roles={roles}
            editing={editing}
            busy={busy}
            setEditing={setEditing}
            onSubmit={submit}
            onRemove={removeActivity}
            onAddTeamMember={addTeamMember}
            onRemoveTeamMember={removeTeamMember}
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
  users,
  roles,
  editing,
  busy,
  setEditing,
  onSubmit,
  onRemove,
  onAddTeamMember,
  onRemoveTeamMember
}: {
  entity: View;
  record: unknown;
  t: Texts;
  users: UserRef[];
  roles: RoleRef[];
  editing: boolean;
  busy: boolean;
  setEditing: (value: boolean) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onRemove: () => void;
  onAddTeamMember: (teamId: string, userId: string, role: TeamMemberRole) => Promise<void>;
  onRemoveTeamMember: (teamId: string, userId: string) => Promise<void>;
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
        users={users}
        editing={editing}
        busy={busy}
        setEditing={setEditing}
        onSubmit={onSubmit}
        onRemove={onRemove}
        onAddMember={onAddTeamMember}
        onRemoveMember={onRemoveTeamMember}
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
  users,
  editing,
  busy,
  setEditing,
  onSubmit,
  onRemove,
  onAddMember,
  onRemoveMember
}: {
  team: TeamRef & { description?: string };
  t: Texts;
  users: UserRef[];
  editing: boolean;
  busy: boolean;
  setEditing: (value: boolean) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onRemove: () => void;
  onAddMember: (teamId: string, userId: string, role: TeamMemberRole) => Promise<void>;
  onRemoveMember: (teamId: string, userId: string) => Promise<void>;
}) {
  const members = team.members ?? [];
  const memberUserIds = new Set(members.map((member) => member.userId).filter(Boolean));
  const availableUsers = users.filter((user) => user.id && !memberUserIds.has(user.id));
  const [selectedUserId, setSelectedUserId] = useState(availableUsers[0]?.id ?? "");
  const [selectedRole, setSelectedRole] = useState<TeamMemberRole>("MEMBER");
  const effectiveSelectedUserId = availableUsers.some((user) => user.id === selectedUserId)
    ? selectedUserId
    : (availableUsers[0]?.id ?? "");

  return (
    <div className="modal-stack">
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
      <section className="team-members-panel">
        <div className="panel-header">
          <h3>Membros</h3>
          <span>{members.length}</span>
        </div>
        <div className="team-member-controls">
          <label>
            Usuario
            <select
              value={effectiveSelectedUserId}
              disabled={busy || !team.id || !availableUsers.length}
              onChange={(event) => setSelectedUserId(event.target.value)}
            >
              {availableUsers.length ? null : <option value="">Sem usuarios disponiveis</option>}
              {availableUsers.map((user) => (
                <option key={user.id} value={user.id}>
                  {userOptionLabel(user)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Perfil na equipe
            <select
              value={selectedRole}
              disabled={busy || !team.id || !availableUsers.length}
              onChange={(event) => setSelectedRole(event.target.value as TeamMemberRole)}
            >
              <option value="MEMBER">Membro</option>
              <option value="LEADER">Lider</option>
            </select>
          </label>
          <button
            className="primary-button"
            disabled={busy || !team.id || !effectiveSelectedUserId}
            type="button"
            onClick={() => void onAddMember(team.id ?? "", effectiveSelectedUserId, selectedRole)}
          >
            <Plus size={16} />
            Adicionar
          </button>
        </div>
        <div className="team-member-list">
          {members.length ? (
            members.map((member) => (
              <div key={member.id ?? member.userId}>
                <span>
                  <strong>{member.user?.displayName ?? member.user?.email ?? member.userId}</strong>
                  <small>{member.role === "LEADER" ? "Lider" : "Membro"}</small>
                </span>
                <button
                  className="danger-button"
                  disabled={busy || !team.id || !member.userId}
                  type="button"
                  onClick={() => void onRemoveMember(team.id ?? "", member.userId ?? "")}
                >
                  <Trash2 size={16} />
                  Remover
                </button>
              </div>
            ))
          ) : (
            <p className="empty-state">Nenhum membro atribuido.</p>
          )}
        </div>
      </section>
    </div>
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

function InternalTaskBoard({
  activityId,
  token,
  users,
  attachments,
  locale,
  busy
}: {
  activityId: string;
  token?: string;
  users: UserRef[];
  attachments: AttachmentItem[];
  locale: Locale;
  busy: boolean;
}) {
  const [board, setBoard] = useState<ActivityTaskBoard>({ columns: [] });
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function loadBoard() {
    if (!token) return;
    try {
      setBoard(await apiRequest<ActivityTaskBoard>(`/api/activities/${activityId}/task-board`, token));
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Falha ao carregar tarefas");
    }
  }

  useEffect(() => {
    void loadBoard();
  }, [activityId, token]);

  async function createColumn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    const form = new FormData(event.currentTarget);
    await apiRequest(`/api/activities/${activityId}/task-board/columns`, token, {
      method: "POST",
      body: JSON.stringify({
        name: String(form.get("name") ?? ""),
        color: String(form.get("color") || "#64748b")
      })
    });
    event.currentTarget.reset();
    await loadBoard();
  }

  async function createTask(event: FormEvent<HTMLFormElement>, columnId: string) {
    event.preventDefault();
    if (!token) return;
    const form = new FormData(event.currentTarget);
    await apiRequest(`/api/activities/${activityId}/task-board/tasks`, token, {
      method: "POST",
      body: JSON.stringify({
        columnId,
        title: String(form.get("title") ?? ""),
        assigneeId: String(form.get("assigneeId") || "") || undefined,
        priority: String(form.get("priority") || "MEDIUM"),
        labels: String(form.get("labels") || "")
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
        attachmentIds: form.getAll("attachmentIds").map(String).filter(Boolean)
      })
    });
    event.currentTarget.reset();
    await loadBoard();
  }

  async function moveTask(taskId: string, columnId: string, position: number) {
    if (!token) return;
    await apiRequest(`/api/activities/${activityId}/task-board/tasks/${taskId}/move`, token, {
      method: "POST",
      body: JSON.stringify({ columnId, position, note: "Movido no Kanban interno" })
    });
    setDraggedTaskId(null);
    await loadBoard();
  }

  async function archiveTask(taskId: string) {
    if (!token) return;
    await apiRequest(`/api/activities/${activityId}/task-board/tasks/${taskId}/archive`, token, {
      method: "POST",
      body: JSON.stringify({})
    });
    await loadBoard();
  }

  async function updateTask(taskId: string, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    const form = new FormData(event.currentTarget);
    await apiRequest(`/api/activities/${activityId}/task-board/tasks/${taskId}`, token, {
      method: "PATCH",
      body: JSON.stringify({
        columnId: String(form.get("columnId") || ""),
        title: String(form.get("title") ?? ""),
        description: String(form.get("description") || "") || undefined,
        assigneeId: String(form.get("assigneeId") || "") || null,
        priority: String(form.get("priority") || "MEDIUM"),
        labels: String(form.get("labels") || "")
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
        attachmentIds: form.getAll("attachmentIds").map(String).filter(Boolean)
      })
    });
    await loadBoard();
  }

  async function deleteTask(taskId: string) {
    if (!token) return;
    await apiRequest(`/api/activities/${activityId}/task-board/tasks/${taskId}`, token, {
      method: "DELETE"
    });
    await loadBoard();
  }

  async function renameColumn(columnId: string, currentName: string, currentColor?: string | null) {
    if (!token) return;
    const name = window.prompt("Nome da coluna", currentName);
    if (!name?.trim()) return;
    await apiRequest(`/api/activities/${activityId}/task-board/columns/${columnId}`, token, {
      method: "PATCH",
      body: JSON.stringify({ name: name.trim(), color: currentColor ?? "#64748b" })
    });
    await loadBoard();
  }

  async function deleteColumn(columnId: string) {
    if (!token) return;
    await apiRequest(`/api/activities/${activityId}/task-board/columns/${columnId}`, token, {
      method: "DELETE"
    });
    await loadBoard();
  }

  async function reorderColumn(columnId: string, direction: -1 | 1) {
    if (!token) return;
    const ids = board.columns.map((column) => column.id);
    const index = ids.indexOf(columnId);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= ids.length) return;
    const nextIds = [...ids];
    const [moved] = nextIds.splice(index, 1);
    nextIds.splice(nextIndex, 0, moved);
    await apiRequest(`/api/activities/${activityId}/task-board/columns/reorder`, token, {
      method: "POST",
      body: JSON.stringify({ columnIds: nextIds })
    });
    await loadBoard();
  }

  return (
    <article className="panel span-2 internal-kanban">
      <div className="panel-header">
        <h2>Kanban da atividade</h2>
        <form className="inline-create-form" onSubmit={(event) => void createColumn(event)}>
          <input name="name" placeholder="Nova coluna" required />
          <input name="color" type="color" defaultValue="#64748b" />
          <button className="compact-button" disabled={busy || !token} type="submit">
            <Plus size={16} />
          </button>
        </form>
      </div>
      {message ? <p className="form-error">{message}</p> : null}
      <div className="internal-kanban-board">
        {board.columns.map((column) => (
          <section
            className="internal-kanban-column"
            key={column.id}
            onDragOver={(event) => event.preventDefault()}
            onDrop={() =>
              draggedTaskId
                ? void moveTask(draggedTaskId, column.id, column.tasks?.length ?? 0)
                : undefined
            }
          >
            <div className="internal-column-header">
              <h3>
                <i style={{ backgroundColor: column.color ?? "#64748b" }} />
                {column.name}
              </h3>
              <div>
                <button
                  className="icon-button"
                  type="button"
                  title="Mover para esquerda"
                  onClick={() => void reorderColumn(column.id, -1)}
                >
                  <ChevronLeft size={15} />
                </button>
                <button
                  className="icon-button"
                  type="button"
                  title="Mover para direita"
                  onClick={() => void reorderColumn(column.id, 1)}
                >
                  <ChevronRight size={15} />
                </button>
                <button
                  className="compact-button"
                  type="button"
                  onClick={() => void renameColumn(column.id, column.name, column.color)}
                >
                  Editar
                </button>
                <button
                  className="icon-button"
                  type="button"
                  title="Excluir coluna"
                  onClick={() => void deleteColumn(column.id)}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
            {(column.tasks ?? []).map((task, index) => (
              <InternalTaskCard
                key={task.id}
                task={task}
                columns={board.columns}
                users={users}
                attachments={attachments}
                busy={busy}
                onArchive={() => void archiveTask(task.id)}
                onDelete={() => void deleteTask(task.id)}
                onUpdate={(event) => void updateTask(task.id, event)}
                onDragStart={() => setDraggedTaskId(task.id)}
                onDropBefore={() => draggedTaskId && void moveTask(draggedTaskId, column.id, index)}
              />
            ))}
            <form className="task-create-form" onSubmit={(event) => void createTask(event, column.id)}>
              <input name="columnId" type="hidden" value={column.id} readOnly />
              <input name="title" placeholder="Nova tarefa" required />
              <select name="assigneeId" defaultValue="">
                <option value="">Responsavel</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {userOptionLabel(user)}
                  </option>
                ))}
              </select>
              <select name="priority" defaultValue="MEDIUM">
                {priorities.map((priority) => (
                  <option key={priority} value={priority}>
                    {priority}
                  </option>
                ))}
              </select>
              <input name="labels" placeholder="Etiquetas separadas por virgula" />
              {attachments.length ? (
                <div className="task-attachment-options">
                  {attachments.map((attachment) => (
                    <label key={attachment.id ?? attachment.fileName}>
                      <input name="attachmentIds" type="checkbox" value={attachment.id ?? ""} />
                      {attachment.fileName ?? "-"}
                    </label>
                  ))}
                </div>
              ) : null}
              <button className="compact-button" disabled={busy || !token} type="submit">
                <Plus size={16} />
              </button>
            </form>
          </section>
        ))}
      </div>
      <section className="internal-history">
        <div className="panel-header">
          <h3>Historico do Kanban interno</h3>
          <span>{board.history?.length ?? 0}</span>
        </div>
        <div className="timeline">
          {(board.history ?? []).length ? (
            board.history?.map((item) => (
              <div key={item.id}>
                <strong>{item.type}</strong>
                <span>
                  {formatDateTime(item.createdAt, locale)} - {item.actor?.displayName ?? "-"}
                </span>
                <small>{taskHistoryText(item)}</small>
              </div>
            ))
          ) : (
            <div>
              <strong>Sem movimentacoes</strong>
              <span>As alteracoes nas tarefas aparecem aqui.</span>
            </div>
          )}
        </div>
      </section>
    </article>
  );
}

function InternalTaskCard({
  task,
  columns,
  users,
  attachments,
  busy,
  onDragStart,
  onDropBefore,
  onUpdate,
  onDelete,
  onArchive
}: {
  task: ActivityTaskItem;
  columns: { id: string; name: string }[];
  users: UserRef[];
  attachments: AttachmentItem[];
  busy: boolean;
  onDragStart: () => void;
  onDropBefore: () => void;
  onUpdate: (event: FormEvent<HTMLFormElement>) => void;
  onDelete: () => void;
  onArchive: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const labels = (task.labels ?? []).join(", ");
  const attachmentIds = new Set(task.attachmentIds ?? []);
  return (
    <div
      className="internal-task-card"
      draggable
      onDragStart={onDragStart}
      onDragOver={(event) => event.preventDefault()}
      onDrop={onDropBefore}
    >
      {editing ? (
        <form className="internal-task-edit-form" onSubmit={onUpdate}>
          <input name="title" defaultValue={task.title} required />
          <select name="columnId" defaultValue={task.columnId}>
            {columns.map((column) => (
              <option key={column.id} value={column.id}>
                {column.name}
              </option>
            ))}
          </select>
          <select name="assigneeId" defaultValue={task.assigneeId ?? ""}>
            <option value="">Responsavel</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {userOptionLabel(user)}
              </option>
            ))}
          </select>
          <select name="priority" defaultValue={task.priority ?? "MEDIUM"}>
            {priorities.map((priority) => (
              <option key={priority} value={priority}>
                {priority}
              </option>
            ))}
          </select>
          <textarea name="description" defaultValue={task.description ?? ""} />
          <input name="labels" defaultValue={labels} placeholder="Etiquetas" />
          {attachments.length ? (
            <div className="task-attachment-options">
              {attachments.map((attachment) => (
                <label key={attachment.id ?? attachment.fileName}>
                  <input
                    name="attachmentIds"
                    type="checkbox"
                    value={attachment.id ?? ""}
                    defaultChecked={attachment.id ? attachmentIds.has(attachment.id) : false}
                  />
                  {attachment.fileName ?? "-"}
                </label>
              ))}
            </div>
          ) : null}
          <div className="internal-task-actions">
            <button className="primary-button" disabled={busy} type="submit">
              <Save size={15} />
              Salvar
            </button>
            <button className="compact-button" type="button" onClick={() => setEditing(false)}>
              Fechar
            </button>
          </div>
        </form>
      ) : (
        <>
          <strong>{task.title}</strong>
          <small>{task.assignee?.displayName ?? task.assignee?.email ?? "-"}</small>
          {task.description ? <p>{task.description}</p> : null}
          <div>
            <span className={`priority ${(task.priority ?? "MEDIUM").toLowerCase()}`}>
              {task.priority ?? "MEDIUM"}
            </span>
            {(task.labels ?? []).map((label) => (
              <span key={label}>{label}</span>
            ))}
            {(task.attachmentIds ?? []).map((attachmentId) => {
              const attachment = attachments.find((item) => item.id === attachmentId);
              return <span key={attachmentId}>{attachment?.fileName ?? "Anexo"}</span>;
            })}
          </div>
          <div className="internal-task-actions">
            <button className="compact-button" type="button" onClick={() => setEditing(true)}>
              Editar
            </button>
            <button className="icon-button static" type="button" title="Arquivar" onClick={onArchive}>
              <Archive size={15} />
            </button>
            <button className="icon-button static" type="button" title="Excluir" onClick={onDelete}>
              <Trash2 size={15} />
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function taskHistoryText(item: {
  note?: string | null;
  fromColumnId?: string | null;
  toColumnId?: string | null;
  fromPosition?: number | null;
  toPosition?: number | null;
}) {
  if (item.note) return item.note;
  const moved = [item.fromPosition, item.toPosition].filter((value) => value !== undefined);
  if (item.fromColumnId || item.toColumnId || moved.length) return "Movimentacao registrada.";
  return "Alteracao registrada.";
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
