// en-GB: Provides bounded, context-bound coverage consultation and explicit-zone creation within a Shift modal.
"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { apiRequest, captureApiSessionEpoch, isApiSessionEpochCurrent } from "../lib/api";
import { createLatestRequestCoordinator, isAbortError } from "../lib/latest-request";
import type {
  ListResponse,
  Locale,
  ShiftCoverageItem,
  ShiftCoverageType,
  Texts,
  UserRef
} from "../lib/types";
import { formatDateTime, userOptionLabel } from "../lib/utils";
import { isNamedTimezone, zonedDatetimeInstant } from "../lib/zoned-datetime";
import { ReferenceSelectInput } from "./controls";
import type { ModalMutationOutcome } from "./record-modal-task-board";

export type CoverageMutationRunner = (
  authorised: boolean,
  request: (signal: AbortSignal) => Promise<unknown>,
  hooks: {
    onCurrentSuccess: (originEpoch: number) => void;
    reconcileLocal: (originEpoch: number) => Promise<void>;
  }
) => Promise<ModalMutationOutcome>;

const coverageTypes: ShiftCoverageType[] = [
  "REGULAR",
  "ON_CALL",
  "VACATION",
  "SUBSTITUTE",
  "ABSENCE"
];
type Context = { identity: string };
type CoveragePage = { context: Context; page: number } & (
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; items: ShiftCoverageItem[]; total: number }
);

export function ShiftCoverages({
  shiftId,
  timezone,
  t,
  locale,
  token,
  users,
  canWrite,
  canLoadUsers,
  editing,
  busy,
  runCoverageMutation
}: {
  shiftId: string;
  timezone?: string;
  t: Texts;
  locale: Locale;
  token?: string;
  users: UserRef[];
  canWrite: boolean;
  canLoadUsers: boolean;
  editing: boolean;
  busy: boolean;
  runCoverageMutation: CoverageMutationRunner;
}) {
  const originEpoch = useRef(captureApiSessionEpoch()).current;
  const identity = JSON.stringify([shiftId, timezone]);
  const contextRef = useRef<Context>({ identity });
  if (contextRef.current.identity !== identity) contextRef.current = { identity };
  const context = contextRef.current;
  const mounted = useRef(true);
  const pending = useRef(false);
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [selection, setSelection] = useState({ context, userId: "", replacementForUserId: "" });
  const [requested, setRequested] = useState({ context, page: 1 });
  const page = requested.context === context ? requested.page : 1;
  const pageRef = useRef(page);
  pageRef.current = page;
  const [snapshot, setSnapshot] = useState<CoveragePage>({ context, page, status: "loading" });
  const coordinator = useRef(createLatestRequestCoordinator()).current;
  const access = useRef({ canWrite, canLoadUsers, editing, busy, token });
  access.current = { canWrite, canLoadUsers, editing, busy, token };
  const isCurrent = () =>
    mounted.current && contextRef.current === context && isApiSessionEpochCurrent(originEpoch);
  const availableZone = isNamedTimezone(timezone);
  const disabled =
    !isCurrent() ||
    !token ||
    !availableZone ||
    !canWrite ||
    !canLoadUsers ||
    editing ||
    busy ||
    creating;
  const visible =
    isCurrent() && snapshot.context === context && snapshot.page === page ? snapshot : null;
  const selected =
    selection.context === context ? selection : { userId: "", replacementForUserId: "" };
  const labels: Record<ShiftCoverageType, string> = {
    REGULAR: t.coverageRegular,
    ON_CALL: t.coverageOnCall,
    VACATION: t.coverageVacation,
    SUBSTITUTE: t.coverageSubstitute,
    ABSENCE: t.coverageAbsence
  };

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      coordinator.cancel();
    };
  }, [coordinator]);

  async function loadPage(expectedEpoch = originEpoch) {
    if (
      !isCurrent() ||
      expectedEpoch !== originEpoch ||
      !token ||
      !shiftId ||
      pageRef.current !== page
    )
      return;
    const request = coordinator.begin();
    const admitted = () => isCurrent() && request.isCurrent() && pageRef.current === page;
    setSnapshot({ context, page, status: "loading" });
    try {
      const result = await apiRequest<ListResponse<ShiftCoverageItem>>(
        `/api/shifts/${shiftId}/coverages?page=${page}&pageSize=25`,
        token,
        { signal: request.signal }
      );
      if (!admitted()) return;
      if (
        result.page !== page ||
        result.pageSize !== 25 ||
        !Number.isInteger(result.total) ||
        result.total < 0 ||
        !Array.isArray(result.items)
      ) {
        throw new Error("Invalid coverage page");
      }
      setSnapshot({ context, page, status: "ready", items: result.items, total: result.total });
    } catch (cause) {
      if (admitted() && !isAbortError(cause)) setSnapshot({ context, page, status: "error" });
    }
  }

  useEffect(() => {
    void loadPage();
    return () => coordinator.cancel();
  }, [context, coordinator, page, token]);

  function changePage(nextPage: number) {
    if (!isCurrent() || pending.current || access.current.busy || pageRef.current !== page) return;
    if (nextPage < 1 || nextPage > 10000) return;
    coordinator.cancel();
    pageRef.current = nextPage;
    setRequested({ context, page: nextPage });
  }

  async function createCoverage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const current = access.current;
    if (
      !isCurrent() ||
      pending.current ||
      !current.token ||
      !current.canWrite ||
      !current.canLoadUsers ||
      current.editing ||
      current.busy ||
      !availableZone
    )
      return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    let payload: Record<string, unknown>;
    try {
      const startsAt = zonedDatetimeInstant(String(form.get("startsAt") ?? ""), timezone);
      const endsAt = zonedDatetimeInstant(String(form.get("endsAt") ?? ""), timezone);
      const userId = String(form.get("userId") ?? "");
      const type = String(form.get("type") ?? "REGULAR") as ShiftCoverageType;
      if (!userId || !coverageTypes.includes(type) || Date.parse(startsAt) >= Date.parse(endsAt))
        throw new RangeError("Invalid coverage period");
      payload = {
        userId,
        type,
        startsAt,
        endsAt,
        replacementForUserId: String(form.get("replacementForUserId") || "") || undefined,
        note: String(form.get("note") || "") || undefined
      };
    } catch {
      setMessage(t.coverageInvalidPeriod);
      return;
    }
    pending.current = true;
    setCreating(true);
    setMessage(null);
    try {
      await runCoverageMutation(
        true,
        (signal) =>
          apiRequest(`/api/shifts/${shiftId}/coverages`, token, {
            method: "POST",
            body: JSON.stringify(payload),
            signal
          }),
        {
          onCurrentSuccess: (epoch) => {
            if (!isCurrent() || epoch !== originEpoch) return;
            formElement.reset();
            setSelection({ context, userId: "", replacementForUserId: "" });
          },
          reconcileLocal: async (epoch) => {
            if (isCurrent()) await loadPage(epoch);
          }
        }
      );
    } finally {
      pending.current = false;
      if (isCurrent()) setCreating(false);
    }
  }

  return (
    <section aria-label={t.shiftCoverages} className="modal-stack">
      <h3>{t.shiftCoverages}</h3>
      <p>{availableZone ? `${t.coverageZone}: ${timezone}` : t.coverageZoneUnavailable}</p>
      <div
        aria-busy={Boolean(token && isCurrent() && (!visible || visible.status === "loading"))}
        aria-live="polite"
      >
        {!isCurrent() || !token ? (
          <p>{t.requestFailed}</p>
        ) : visible?.status === "error" ? (
          <p role="alert">{t.coverageLoadFailed}</p>
        ) : !visible || visible.status === "loading" ? (
          <p role="status">{t.loading}</p>
        ) : (
          <>
            {visible.items.length ? (
              <ul>
                {visible.items.map((coverage) => (
                  <li key={coverage.id}>
                    <strong>{userOptionLabel(coverage.user)}</strong> · {labels[coverage.type]}
                    <p>
                      {availableZone
                        ? formatDateTime(coverage.startsAt, locale, timezone)
                        : coverage.startsAt}{" "}
                      —{" "}
                      {availableZone
                        ? formatDateTime(coverage.endsAt, locale, timezone)
                        : coverage.endsAt}
                    </p>
                    {coverage.replacementForUser ? (
                      <p>
                        {t.coverageReplacement}: {userOptionLabel(coverage.replacementForUser)}
                      </p>
                    ) : null}
                    {coverage.note ? <p>{coverage.note}</p> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p>{t.coverageEmpty}</p>
            )}
            <p>
              {t.page} {page} · {visible.total} {t.records}
            </p>
          </>
        )}
      </div>
      <div className="modal-actions">
        <button
          type="button"
          className="compact-button"
          disabled={!isCurrent() || page <= 1 || busy || creating}
          onClick={() => changePage(page - 1)}
        >
          {t.previous}
        </button>
        <button
          type="button"
          className="compact-button"
          disabled={
            !isCurrent() ||
            visible?.status !== "ready" ||
            page * 25 >= visible.total ||
            page >= 10000 ||
            busy ||
            creating
          }
          onClick={() => changePage(page + 1)}
        >
          {t.next}
        </button>
        <button
          type="button"
          className="compact-button"
          disabled={!isCurrent() || !token || busy || creating}
          onClick={() => {
            if (!pending.current && !access.current.busy) void loadPage();
          }}
        >
          {t.refresh}
        </button>
      </div>
      {canWrite && !canLoadUsers ? <p>{t.coverageReferenceRequired}</p> : null}
      {canWrite && canLoadUsers ? (
        <form key={identity} className="modal-grid" onSubmit={createCoverage}>
          <h4 className="span-2">{t.addCoverage}</h4>
          <div className="reference-field">
            <span>{t.user}</span>
            <ReferenceSelectInput
              t={t}
              label={t.user}
              name="userId"
              resource="users"
              initialItems={users}
              token={token}
              loadEnabled={!disabled}
              disabled={disabled}
              required
              placeholder="—"
              value={selected.userId}
              onValueChange={(userId) => {
                if (isCurrent()) setSelection({ context, ...selected, userId });
              }}
            />
          </div>
          <div className="reference-field">
            <span>{t.coverageReplacement}</span>
            <ReferenceSelectInput
              t={t}
              label={t.coverageReplacement}
              name="replacementForUserId"
              resource="users"
              initialItems={users}
              token={token}
              loadEnabled={!disabled}
              disabled={disabled}
              placeholder="—"
              value={selected.replacementForUserId}
              onValueChange={(replacementForUserId) => {
                if (isCurrent()) setSelection({ context, ...selected, replacementForUserId });
              }}
            />
          </div>
          <label>
            {t.coverageType}
            <select name="type" defaultValue="REGULAR" disabled={disabled}>
              {coverageTypes.map((type) => (
                <option key={type} value={type}>
                  {labels[type]}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t.coverageStart}
            <input
              name="startsAt"
              type="datetime-local"
              step="0.001"
              required
              disabled={disabled}
            />
          </label>
          <label>
            {t.coverageEnd}
            <input name="endsAt" type="datetime-local" step="0.001" required disabled={disabled} />
          </label>
          <label className="span-2">
            {t.coverageNote}
            <textarea name="note" maxLength={5000} disabled={disabled} />
          </label>
          {message && selection.context === context ? (
            <p role="alert" className="form-error span-2">
              {message}
            </p>
          ) : null}
          <button className="primary-button" type="submit" disabled={disabled}>
            {t.addCoverage}
          </button>
        </form>
      ) : null}
    </section>
  );
}
