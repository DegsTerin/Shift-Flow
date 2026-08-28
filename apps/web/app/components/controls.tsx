// en-GB: Renders the controls interface so its behaviour and accessible structure stay reusable.
"use client";

import { Filter } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { apiRequest, captureApiSessionEpoch, isApiSessionEpochCurrent } from "../lib/api";
import { createLatestRequestCoordinator, isAbortError } from "../lib/latest-request";
import type {
  ClientRef,
  Filters,
  IconType,
  ListResponse,
  ReferenceAccess,
  RoleRef,
  ShiftRef,
  TeamRef,
  Texts,
  UserRef
} from "../lib/types";
import {
  priorities,
  activityStatuses,
  emptyFilters,
  hasInvertedDateRange,
  priorityLabel,
  statusLabel,
  userOptionLabel
} from "../lib/utils";

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
          aria-pressed={option === value}
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
  selectedLabel,
  disabled = false,
  required = false
}: {
  name: string;
  value: string;
  options: string[][];
  selectedLabel?: string;
  disabled?: boolean;
  required?: boolean;
}) {
  const stableOptions = withSelectedOption(options, value, selectedLabel);
  return (
    <select name={name} defaultValue={value} disabled={disabled} required={required}>
      {stableOptions.map(([id, text]) => (
        <option key={id} value={id}>
          {text}
        </option>
      ))}
    </select>
  );
}

export function withSelectedOption(options: string[][], value: string, label = value) {
  if (!value || options.some(([id]) => id === value)) return options;
  return [[value, label || value], ...options];
}

type ReferenceResource = "clients" | "users" | "teams" | "shifts" | "roles";
type ReferenceItem = ClientRef | UserRef | TeamRef | ShiftRef | RoleRef;
const noReferenceAccess: ReferenceAccess = {
  clients: false,
  users: false,
  teams: false,
  shifts: false,
  roles: false
};

function referenceEndpoint(resource: ReferenceResource) {
  return resource === "roles" ? "/api/rbac/roles" : `/api/${resource}`;
}

export function referenceOption(resource: ReferenceResource, item: ReferenceItem): string[] | null {
  if (!item.id) return null;
  if (resource === "users") return [item.id, userOptionLabel(item as UserRef)];
  if (resource === "roles") {
    const role = item as RoleRef;
    if (role.scope !== "COMPANY" || role.isActive === false) return null;
    return [item.id, role.name ?? "-"];
  }
  return [item.id, (item as ClientRef | TeamRef | ShiftRef).name ?? "-"];
}

export function ReferenceSelectInput({
  t,
  label,
  name,
  value,
  selectedLabel,
  resource,
  initialItems,
  token,
  loadEnabled,
  excludedIds = [],
  placeholder,
  compactTools = false,
  disabled = false,
  required = false,
  onValueChange
}: {
  t: Texts;
  label: string;
  name?: string;
  value: string;
  selectedLabel?: string;
  resource: ReferenceResource;
  initialItems: ReferenceItem[];
  token?: string;
  loadEnabled: boolean;
  excludedIds?: string[];
  placeholder?: string;
  compactTools?: boolean;
  disabled?: boolean;
  required?: boolean;
  onValueChange?: (value: string) => void;
}) {
  const initialOptions = useMemo(
    () => initialItems.map((item) => referenceOption(resource, item)).filter(Boolean) as string[][],
    [initialItems, resource]
  );
  const initialSnapshot = useMemo(
    () => ({ options: initialOptions, total: initialOptions.length, page: 1, pageSize: 25 }),
    [initialOptions]
  );
  const currentEpoch = captureApiSessionEpoch();
  const observedEpoch = useRef(currentEpoch);
  const crossedSessionBoundary = observedEpoch.current !== currentEpoch;
  const [selected, setSelected] = useState(value);
  const [selectedText, setSelectedText] = useState(selectedLabel ?? value);
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [search, setSearch] = useState("");
  const [requestSearch, setRequestSearch] = useState("");
  const [requestedPage, setRequestedPage] = useState(1);
  const [requestRevision, setRequestRevision] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const coordinator = useRef(createLatestRequestCoordinator()).current;
  const excluded = useMemo(() => new Set(excludedIds), [excludedIds]);
  const effectiveSnapshot = crossedSessionBoundary ? initialSnapshot : snapshot;
  const effectiveSelected = crossedSessionBoundary ? value : selected;
  const effectiveSelectedText = crossedSessionBoundary ? (selectedLabel ?? value) : selectedText;
  const selectedFallback =
    effectiveSelected === value && selectedLabel ? selectedLabel : effectiveSelectedText;
  const selectableOptions = withSelectedOption(
    effectiveSnapshot.options.filter(([id]) => !excluded.has(id) || id === effectiveSelected),
    effectiveSelected,
    selectedFallback
  );
  const totalPages = Math.max(1, Math.ceil(effectiveSnapshot.total / effectiveSnapshot.pageSize));
  const showTools =
    loadEnabled &&
    !disabled &&
    (!compactTools || effectiveSnapshot.total > effectiveSnapshot.pageSize || search || error);

  useEffect(() => {
    setSelected(value);
    setSelectedText(selectedLabel ?? value);
  }, [selectedLabel, value]);
  useEffect(() => {
    if (observedEpoch.current === currentEpoch) return;
    observedEpoch.current = currentEpoch;
    coordinator.cancel();
    setSelected(value);
    setSelectedText(selectedLabel ?? value);
    setSnapshot(initialSnapshot);
    setSearch("");
    setRequestSearch("");
    setRequestedPage(1);
    setRequestRevision((revision) => revision + 1);
    setLoading(false);
    setError(null);
  }, [coordinator, currentEpoch, initialSnapshot, selectedLabel, value]);
  useEffect(() => {
    if (!loadEnabled) {
      setSnapshot(initialSnapshot);
    }
  }, [initialSnapshot, loadEnabled]);

  useEffect(() => {
    if (!loadEnabled) return undefined;
    const timeout = window.setTimeout(() => {
      const nextSearch = search.trim().slice(0, 200);
      if (nextSearch === requestSearch) return;
      setRequestedPage(1);
      setRequestSearch(nextSearch);
      setRequestRevision((revision) => revision + 1);
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [loadEnabled, requestSearch, search]);

  useEffect(() => {
    if (!loadEnabled || !token || crossedSessionBoundary) return undefined;
    const epoch = captureApiSessionEpoch();
    if (epoch === null) return undefined;
    const request = coordinator.begin();
    const isCurrent = () => request.isCurrent() && isApiSessionEpochCurrent(epoch);
    const params = new URLSearchParams({ page: String(requestedPage), pageSize: "25" });
    if (requestSearch) params.set("search", requestSearch);
    setLoading(true);
    setError(null);
    void apiRequest<ListResponse<ReferenceItem>>(
      `${referenceEndpoint(resource)}?${params}`,
      token,
      { signal: request.signal }
    )
      .then((result) => {
        if (!isCurrent()) return;
        const responsePage = result.page ?? requestedPage;
        if (responsePage !== requestedPage) throw new Error(t.referencePaginationMismatch);
        const pageSize = result.pageSize ?? 25;
        const lastPage = Math.max(1, Math.ceil(result.total / pageSize));
        if (requestedPage > lastPage) {
          setRequestedPage(lastPage);
          setRequestRevision((revision) => revision + 1);
          return;
        }
        setSnapshot({
          options: result.items
            .map((item) => referenceOption(resource, item))
            .filter(Boolean) as string[][],
          total: result.total,
          page: responsePage,
          pageSize
        });
      })
      .catch((cause) => {
        if (!isCurrent() || isAbortError(cause)) return;
        setError(cause instanceof Error ? cause.message : t.referenceLoadFailed);
      })
      .finally(() => {
        if (isCurrent()) setLoading(false);
      });
    return () => coordinator.cancel();
  }, [
    coordinator,
    crossedSessionBoundary,
    currentEpoch,
    loadEnabled,
    requestRevision,
    requestedPage,
    requestSearch,
    resource,
    t.referenceLoadFailed,
    t.referencePaginationMismatch,
    token
  ]);

  useEffect(() => () => coordinator.cancel(), [coordinator]);

  return (
    <div className="reference-select">
      <select
        aria-label={label}
        disabled={disabled || crossedSessionBoundary}
        name={name}
        required={required}
        value={effectiveSelected}
        onChange={(event) => {
          if (crossedSessionBoundary) return;
          const nextValue = event.target.value;
          const nextLabel = selectableOptions.find(([id]) => id === nextValue)?.[1] ?? nextValue;
          setSelected(nextValue);
          setSelectedText(nextLabel);
          onValueChange?.(nextValue);
        }}
      >
        {placeholder !== undefined ? (
          <option disabled={required} value="">
            {placeholder}
          </option>
        ) : null}
        {selectableOptions
          .filter(([id]) => id)
          .map(([id, text]) => (
            <option key={id} value={id}>
              {text}
            </option>
          ))}
      </select>
      {showTools ? (
        <div className="reference-select-tools">
          <input
            aria-label={`${t.search}: ${label}`}
            maxLength={200}
            placeholder={t.search}
            type="search"
            value={crossedSessionBoundary ? "" : search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <button
            aria-label={`${t.previous}: ${label}`}
            className="icon-button"
            disabled={loading || crossedSessionBoundary || effectiveSnapshot.page <= 1}
            onClick={() => {
              setRequestedPage(Math.max(1, effectiveSnapshot.page - 1));
              setRequestRevision((revision) => revision + 1);
            }}
            type="button"
          >
            {t.previous}
          </button>
          <span aria-atomic="true" aria-live="polite">
            <span aria-hidden="true">
              {effectiveSnapshot.page}/{totalPages}
            </span>
            <span className="sr-only">
              {label}: {t.page} {effectiveSnapshot.page} {t.of} {totalPages}
            </span>
          </span>
          <button
            aria-label={`${t.next}: ${label}`}
            className="icon-button"
            disabled={loading || crossedSessionBoundary || effectiveSnapshot.page >= totalPages}
            onClick={() => {
              setRequestedPage(Math.min(totalPages, effectiveSnapshot.page + 1));
              setRequestRevision((revision) => revision + 1);
            }}
            type="button"
          >
            {t.next}
          </button>
        </div>
      ) : null}
      {error ? (
        <small className="form-error" role="alert">
          {error}
        </small>
      ) : null}
    </div>
  );
}

export function FilterBar({
  t,
  filters,
  setFilters,
  clients,
  teams,
  shifts,
  users,
  visibleFilters,
  token,
  referenceAccess = noReferenceAccess
}: {
  t: Texts;
  filters: Filters;
  setFilters: (filters: Filters) => void;
  clients: ClientRef[];
  teams: TeamRef[];
  shifts: ShiftRef[];
  users: UserRef[];
  visibleFilters?: ReadonlySet<keyof Filters>;
  token?: string;
  referenceAccess?: ReferenceAccess;
}) {
  const update = (key: keyof Filters, value: string) => setFilters({ ...filters, [key]: value });
  const isVisible = (key: keyof Filters) => !visibleFilters || visibleFilters.has(key);
  const invalidDateRange = hasInvertedDateRange(filters);
  const dateRangeErrorId = "filter-date-range-error";
  return (
    <section className="filter-bar">
      <span>
        <Filter size={16} />
        {t.filters}
      </span>
      {isVisible("clientId") ? (
        <div className="reference-field">
          <span>{t.filterClient}</span>
          <ReferenceSelectInput
            compactTools
            t={t}
            value={filters.clientId}
            onValueChange={(value) => update("clientId", value)}
            initialItems={clients}
            label={t.filterClient}
            placeholder={t.all}
            resource="clients"
            token={token}
            loadEnabled={referenceAccess.clients}
          />
        </div>
      ) : null}
      {isVisible("teamId") ? (
        <div className="reference-field">
          <span>{t.filterTeam}</span>
          <ReferenceSelectInput
            compactTools
            t={t}
            value={filters.teamId}
            onValueChange={(value) => update("teamId", value)}
            initialItems={teams}
            label={t.filterTeam}
            placeholder={t.all}
            resource="teams"
            token={token}
            loadEnabled={referenceAccess.teams}
          />
        </div>
      ) : null}
      {isVisible("shiftId") ? (
        <div className="reference-field">
          <span>{t.filterShift}</span>
          <ReferenceSelectInput
            compactTools
            t={t}
            value={filters.shiftId}
            onValueChange={(value) => update("shiftId", value)}
            initialItems={shifts}
            label={t.filterShift}
            placeholder={t.all}
            resource="shifts"
            token={token}
            loadEnabled={referenceAccess.shifts}
          />
        </div>
      ) : null}
      {isVisible("assigneeId") ? (
        <div className="reference-field">
          <span>{t.filterAnalyst}</span>
          <ReferenceSelectInput
            compactTools
            t={t}
            value={filters.assigneeId}
            onValueChange={(value) => update("assigneeId", value)}
            initialItems={users}
            label={t.filterAnalyst}
            placeholder={t.all}
            resource="users"
            token={token}
            loadEnabled={referenceAccess.users}
          />
        </div>
      ) : null}
      {isVisible("priority") ? (
        <Select
          value={filters.priority}
          onChange={(value) => update("priority", value)}
          options={priorities.map((item) => [item, priorityLabel(item, t)])}
          label={t.filterPriority}
          emptyLabel={t.all}
        />
      ) : null}
      {isVisible("status") ? (
        <Select
          value={filters.status}
          onChange={(value) => update("status", value)}
          options={activityStatuses.map((item) => [item, statusLabel(item, t)])}
          label={t.filterStatus}
          emptyLabel={t.all}
        />
      ) : null}
      {isVisible("attention") ? (
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
      ) : null}
      {isVisible("from") ? (
        <label className="date-label">
          <span>{t.filterStartDate}</span>
          <input
            aria-label={t.filterStartDate}
            aria-describedby={invalidDateRange ? dateRangeErrorId : undefined}
            aria-invalid={invalidDateRange || undefined}
            className="date-filter"
            max={filters.to || undefined}
            type="date"
            value={filters.from}
            onChange={(event) => update("from", event.target.value)}
          />
        </label>
      ) : null}
      {isVisible("to") ? (
        <label className="date-label">
          <span>{t.filterEndDate}</span>
          <input
            aria-label={t.filterEndDate}
            aria-describedby={invalidDateRange ? dateRangeErrorId : undefined}
            aria-invalid={invalidDateRange || undefined}
            className="date-filter"
            min={filters.from || undefined}
            type="date"
            value={filters.to}
            onChange={(event) => update("to", event.target.value)}
          />
        </label>
      ) : null}
      {invalidDateRange ? (
        <p className="filter-validation-error" id={dateRangeErrorId} role="alert">
          {t.invalidDateRange}
        </p>
      ) : null}
      <button className="select-button" onClick={() => setFilters(emptyFilters)} type="button">
        {t.clear}
      </button>
    </section>
  );
}
