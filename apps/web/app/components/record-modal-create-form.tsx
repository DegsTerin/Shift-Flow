// en-GB: Renders the record modal create form interface so its behaviour and accessible structure stay reusable.
import { Save } from "lucide-react";
import type { FormEvent } from "react";
import type {
  ActivityItem,
  ClientRef,
  RoleRef,
  ShiftRef,
  TeamRef,
  Texts,
  UserRef,
  View
} from "../lib/types";
import {
  activityStatuses,
  priorities,
  shiftStatuses,
  toDateInputValue,
  userOptionLabel
} from "../lib/utils";
import { SelectInput } from "./controls";

export function CreateForm({
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
            value=""
            options={[
              ["", "Selecione um perfil de empresa"],
              ...roles.map((role) => [role.id ?? "", role.name ?? "-"])
            ]}
            required
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

export function OperationalFields({
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
