// en-GB: Renders the record modal create form interface so its behaviour and accessible structure stay reusable.
import { Save } from "lucide-react";
import type { FormEvent } from "react";
import type {
  ActivityItem,
  ClientRef,
  ReferenceAccess,
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
  priorityLabel,
  shiftInitialStatuses,
  statusLabel
} from "../lib/utils";
import { isNamedTimezone, zonedDateInputValue } from "../lib/zoned-datetime";
import { applyNewPasswordByteValidity, maximumNewPasswordUtf8Bytes } from "../lib/password-input";
import { ReferenceSelectInput, SelectInput } from "./controls";

export function CreateForm({
  entity,
  t,
  companyTimezone,
  clients,
  users,
  teams,
  shifts,
  roles,
  token,
  referenceAccess = {
    clients: false,
    users: false,
    teams: false,
    shifts: false,
    roles: false
  },
  busy,
  onSubmit
}: {
  entity: View;
  t: Texts;
  companyTimezone?: string;
  clients: ClientRef[];
  users: UserRef[];
  teams: TeamRef[];
  shifts: ShiftRef[];
  roles: RoleRef[];
  token?: string;
  referenceAccess?: ReferenceAccess;
  busy: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const now = new Date();
  const later = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  if (entity === "users")
    return (
      <form className="modal-grid" onSubmit={onSubmit}>
        <label>
          {t.name}
          <input name="displayName" required />
        </label>
        <label>
          {t.email}
          <input name="email" type="email" required />
        </label>
        <label>
          {t.jobTitle}
          <input name="jobTitle" />
        </label>
        <label>
          {t.filterStatus}
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
        <div className="reference-field">
          <span>{t.role}</span>
          <ReferenceSelectInput
            t={t}
            label={t.role}
            name="roleId"
            value=""
            initialItems={roles}
            resource="roles"
            token={token}
            loadEnabled={referenceAccess.roles}
            placeholder={t.selectCompanyRole}
            required
          />
        </div>
        <label>
          {t.password}
          <input
            name="password"
            type="password"
            required
            maxLength={maximumNewPasswordUtf8Bytes}
            onInput={(event) =>
              applyNewPasswordByteValidity(event.currentTarget, t.passwordUtf8Limit)
            }
          />
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
          {t.name}
          <input name="name" required />
        </label>
        <label>
          {t.code}
          <input name="code" />
        </label>
        <label>
          {t.filterStatus}
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
          {t.name}
          <input name="name" required />
        </label>
        <label>
          {t.colour}
          <input name="color" defaultValue="#0f766e" />
        </label>
        <label>
          SLA
          <input name="defaultSlaMinutes" type="number" defaultValue="240" />
        </label>
        <label className="span-2">
          {t.description}
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
          {t.name}
          <input name="name" required />
        </label>
        <label>
          {t.start}
          <input
            name="startsAt"
            type="datetime-local"
            defaultValue={zonedDateInputValue(now, companyTimezone)}
            step={60}
            required
          />
        </label>
        <label>
          {t.end}
          <input
            name="endsAt"
            type="datetime-local"
            defaultValue={zonedDateInputValue(later, companyTimezone)}
            step={60}
            required
          />
        </label>
        <label>
          {t.timeZone}
          <input name="timezone" defaultValue={companyTimezone ?? ""} required />
        </label>
        <label>
          {t.filterStatus}
          <SelectInput
            name="status"
            value="OPEN"
            options={shiftInitialStatuses.map((item) => [item, item])}
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
        {t.title}
        <input name="title" required />
      </label>
      <div className="reference-field">
        <span>{t.filterClient}</span>
        <ReferenceSelectInput
          t={t}
          label={t.filterClient}
          name="clientId"
          value=""
          initialItems={clients}
          resource="clients"
          token={token}
          loadEnabled={referenceAccess.clients}
          placeholder={t.selectClient}
          required
        />
      </div>
      <div className="reference-field">
        <span>{t.filterTeam}</span>
        <ReferenceSelectInput
          t={t}
          label={t.filterTeam}
          name="teamId"
          value=""
          initialItems={teams}
          resource="teams"
          token={token}
          loadEnabled={referenceAccess.teams}
          placeholder={t.selectTeam}
          required
        />
      </div>
      <div className="reference-field">
        <span>{t.filterShift}</span>
        <ReferenceSelectInput
          t={t}
          label={t.filterShift}
          name="shiftId"
          value=""
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
          value=""
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
          value="MEDIUM"
          options={priorities.map((item) => [item, priorityLabel(item, t)])}
        />
      </label>
      <label>
        {t.filterStatus}
        <SelectInput
          name="status"
          value="PENDING"
          options={activityStatuses.map((item) => [item, statusLabel(item, t)])}
        />
      </label>
      <label>
        SLA{isNamedTimezone(companyTimezone) ? ` (${companyTimezone})` : ""}
        <input
          name="slaDueAt"
          type="datetime-local"
          step={60}
          defaultValue={zonedDateInputValue(later, companyTimezone)}
          disabled={!isNamedTimezone(companyTimezone)}
        />
      </label>
      {!isNamedTimezone(companyTimezone) ? (
        <p className="guard-note span-2">{t.timeZoneUnavailable}</p>
      ) : null}
      <label>
        {t.system}
        <input name="systemName" />
      </label>
      <label>
        {t.service}
        <input name="serviceName" />
      </label>
      <OperationalFields t={t} />
      <button className="primary-button span-2" disabled={busy} type="submit">
        <Save size={16} />
        {t.save}
      </button>
    </form>
  );
}

export function OperationalFields({
  activity,
  t,
  disabled = false
}: {
  activity?: ActivityItem;
  t: Texts;
  disabled?: boolean;
}) {
  return (
    <>
      <label className="span-2">
        {t.requestedWork}
        <textarea
          name="requested"
          defaultValue={activity?.requested ?? ""}
          disabled={disabled}
          required={!activity}
        />
      </label>
      <label className="span-2">
        {t.performedWork}
        <textarea
          name="performed"
          defaultValue={activity?.performed ?? ""}
          disabled={disabled}
          required={!activity}
        />
      </label>
      <label className="span-2">
        {t.workInProgress}
        <textarea
          name="inProgressDetail"
          defaultValue={activity?.inProgressDetail ?? ""}
          disabled={disabled}
          required={!activity}
        />
      </label>
      <label className="span-2">
        {t.pendingWork}
        <textarea
          name="pendingDetail"
          defaultValue={activity?.pendingDetail ?? ""}
          disabled={disabled}
          required={!activity}
        />
      </label>
      <label className="span-2">
        {t.finalisation}
        <textarea
          name="finalizationDetail"
          defaultValue={activity?.finalizationDetail ?? ""}
          disabled={disabled}
          required={!activity}
        />
      </label>
      <label className="span-2">
        {t.observations}
        <textarea
          name="observations"
          defaultValue={activity?.observations ?? ""}
          disabled={disabled}
        />
      </label>
    </>
  );
}
