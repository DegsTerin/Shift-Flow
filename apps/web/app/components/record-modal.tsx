// en-GB: Renders the record modal interface so its behaviour and accessible structure stay reusable.
"use client";

import { Plus, Save, Trash2, X } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { apiRequest } from "../lib/api";
import type {
  ActivityItem,
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
  createRecord,
  recordEndpoint,
  recordPayload,
  shiftStatuses,
  userOptionLabel,
  userRoleId,
  userRoleOptions
} from "../lib/utils";
import { SelectInput } from "./controls";
import { ActivityDetail } from "./record-modal-activity-detail";
import { CreateForm } from "./record-modal-create-form";

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
          value={userRoleId(user)}
          disabled={!editing}
          options={userRoleOptions(user, roles)}
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

function modalTitle(entity: View, t: Texts) {
  return t[entity === "team-dashboard" ? "teamDashboard" : entity];
}
