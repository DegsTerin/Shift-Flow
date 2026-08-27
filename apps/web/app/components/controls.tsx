// en-GB: Renders the controls interface so its behaviour and accessible structure stay reusable.
"use client";

import { Filter } from "lucide-react";
import type { ClientRef, Filters, IconType, Texts, UserRef, TeamRef, ShiftRef } from "../lib/types";
import { priorities, activityStatuses, emptyFilters, userOptionLabel } from "../lib/utils";

export function SegmentedControl({
  label,
  options,
  value,
  onChange
}: {
  label: string;
  options: string[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="segmented" aria-label={label}>
      {options.map((option) => (
        <button
          className={option === value ? "selected" : ""}
          key={option}
          onClick={() => onChange(option)}
          type="button"
        >
          {option}
        </button>
      ))}
    </div>
  );
}

export function IconToggle({
  label,
  icon: Icon,
  onClick
}: {
  label: string;
  icon: IconType;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={label}
      className="icon-button"
      onClick={onClick}
      title={label}
      type="button"
    >
      <Icon size={17} />
    </button>
  );
}

export function Select({
  label,
  emptyLabel,
  value,
  options,
  onChange
}: {
  label: string;
  emptyLabel?: string;
  value: string;
  options: string[][];
  onChange: (value: string) => void;
}) {
  return (
    <label className="select-label">
      <span>{label}</span>
      <select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">{emptyLabel ?? label}</option>
        {options
          .filter(([id]) => id)
          .map(([id, text]) => (
            <option key={id} value={id}>
              {text}
            </option>
          ))}
      </select>
    </label>
  );
}

export function SelectInput({
  name,
  value,
  options,
  disabled = false,
  required = false
}: {
  name: string;
  value: string;
  options: string[][];
  disabled?: boolean;
  required?: boolean;
}) {
  return (
    <select name={name} defaultValue={value} disabled={disabled} required={required}>
      {options.map(([id, text]) => (
        <option key={id} value={id}>
          {text}
        </option>
      ))}
    </select>
  );
}

export function FilterBar({
  t,
  filters,
  setFilters,
  clients,
  teams,
  shifts,
  users
}: {
  t: Texts;
  filters: Filters;
  setFilters: (filters: Filters) => void;
  clients: ClientRef[];
  teams: TeamRef[];
  shifts: ShiftRef[];
  users: UserRef[];
}) {
  const update = (key: keyof Filters, value: string) => setFilters({ ...filters, [key]: value });
  return (
    <section className="filter-bar">
      <span>
        <Filter size={16} />
        {t.filters}
      </span>
      <Select
        value={filters.clientId}
        onChange={(value) => update("clientId", value)}
        options={clients.map((item) => [item.id ?? "", item.name ?? "-"])}
        label={t.filterClient}
        emptyLabel={t.all}
      />
      <Select
        value={filters.teamId}
        onChange={(value) => update("teamId", value)}
        options={teams.map((item) => [item.id ?? "", item.name ?? "-"])}
        label={t.filterTeam}
        emptyLabel={t.all}
      />
      <Select
        value={filters.shiftId}
        onChange={(value) => update("shiftId", value)}
        options={shifts.map((item) => [item.id ?? "", item.name ?? "-"])}
        label={t.filterShift}
        emptyLabel={t.all}
      />
      <Select
        value={filters.assigneeId}
        onChange={(value) => update("assigneeId", value)}
        options={users.map((item) => [item.id ?? "", userOptionLabel(item)])}
        label={t.filterAnalyst}
        emptyLabel={t.all}
      />
      <Select
        value={filters.priority}
        onChange={(value) => update("priority", value)}
        options={priorities.map((item) => [item, item])}
        label={t.filterPriority}
        emptyLabel={t.all}
      />
      <Select
        value={filters.status}
        onChange={(value) => update("status", value)}
        options={activityStatuses.map((item) => [item, item])}
        label={t.filterStatus}
        emptyLabel={t.all}
      />
      <Select
        value={filters.attention}
        onChange={(value) => update("attention", value)}
        options={[
          ["OVERDUE", t.filterOverdue],
          ["CRITICAL", t.filterCritical],
          ["SLA_RISK", t.filterSlaRisk]
        ]}
        label={t.filterAttention}
        emptyLabel={t.all}
      />
      <label className="date-label">
        <span>{t.filterStartDate}</span>
        <input
          aria-label={t.filterStartDate}
          className="date-filter"
          type="date"
          value={filters.from}
          onChange={(event) => update("from", event.target.value)}
        />
      </label>
      <label className="date-label">
        <span>{t.filterEndDate}</span>
        <input
          aria-label={t.filterEndDate}
          className="date-filter"
          type="date"
          value={filters.to}
          onChange={(event) => update("to", event.target.value)}
        />
      </label>
      <button className="select-button" onClick={() => setFilters(emptyFilters)} type="button">
        {t.clear}
      </button>
    </section>
  );
}
