// en-GB: Renders the in-app notification centre with accessible count, list and read controls.
"use client";

import { Bell, Check, CheckCheck, X } from "lucide-react";
import type { KeyboardEvent } from "react";
import type { Locale, NotificationItem, Texts } from "../lib/types";

export function formatNotificationDate(value: string, locale: Locale) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "short",
    timeStyle: "short"
  }).format(date);
}

export function NotificationCentre({
  t,
  locale,
  open,
  unread,
  items,
  loading,
  error,
  canMarkRead,
  pendingId,
  onToggle,
  onClose,
  onMarkRead,
  onMarkAllRead
}: {
  t: Texts;
  locale: Locale;
  open: boolean;
  unread: number;
  items: NotificationItem[];
  loading: boolean;
  error: string | null;
  canMarkRead: boolean;
  pendingId: string | "all" | null;
  onToggle: () => void;
  onClose: () => void;
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
}) {
  const countLabel = `${unread} ${unread === 1 ? t.unreadSingular : t.unread}`;
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Escape" || !open) return;
    event.preventDefault();
    onClose();
  };

  return (
    <div className="notification-centre" onKeyDown={handleKeyDown}>
      <button
        aria-controls="notification-centre-panel"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={`${t.notifications}: ${countLabel}`}
        className={
          open ? "icon-button notification-button active" : "icon-button notification-button"
        }
        onClick={onToggle}
        title={t.notifications}
        type="button"
      >
        <Bell size={17} />
        {unread > 0 ? (
          <span aria-hidden="true" className="notification-badge">
            {unread > 99 ? "99+" : unread}
          </span>
        ) : null}
      </button>
      <span aria-atomic="true" aria-live="polite" className="sr-only">
        {countLabel}
      </span>
      {open ? (
        <section
          aria-labelledby="notification-centre-title"
          className="notification-panel"
          id="notification-centre-panel"
          role="dialog"
        >
          <header className="notification-panel-header">
            <div>
              <h2 id="notification-centre-title">{t.notifications}</h2>
              <p>{countLabel}</p>
            </div>
            <button
              aria-label={t.closeNotifications}
              className="icon-button notification-close-button"
              onClick={onClose}
              title={t.closeNotifications}
              type="button"
            >
              <X size={16} />
            </button>
          </header>
          <div className="notification-panel-toolbar">
            <strong>{t.latestNotifications}</strong>
            {canMarkRead && unread > 0 ? (
              <button
                className="compact-button"
                disabled={pendingId !== null}
                onClick={onMarkAllRead}
                type="button"
              >
                <CheckCheck size={15} />
                {t.markAllRead}
              </button>
            ) : null}
          </div>
          {error ? (
            <p className="notification-error" role="alert">
              {error}
            </p>
          ) : null}
          {loading ? (
            <p aria-live="polite" className="notification-state">
              {t.loading}
            </p>
          ) : items.length === 0 ? (
            <p className="notification-state">{t.noNotifications}</p>
          ) : (
            <ul className="notification-list">
              {items.map((item) => {
                const isUnread = !item.readAt;
                return (
                  <li
                    className={isUnread ? "notification-item unread" : "notification-item"}
                    key={item.id}
                  >
                    <article>
                      <div className="notification-item-heading">
                        <strong>{item.title}</strong>
                        {isUnread ? (
                          <span aria-label={t.unreadSingular} className="notification-unread-dot" />
                        ) : null}
                      </div>
                      {item.body ? <p>{item.body}</p> : null}
                      <time dateTime={item.createdAt}>
                        {formatNotificationDate(item.createdAt, locale)}
                      </time>
                    </article>
                    {isUnread && canMarkRead ? (
                      <button
                        aria-label={`${t.markAsRead}: ${item.title}`}
                        className="compact-button notification-read-button"
                        disabled={pendingId !== null}
                        onClick={() => onMarkRead(item.id)}
                        type="button"
                      >
                        <Check size={14} />
                        {pendingId === item.id ? t.loading : t.markAsRead}
                      </button>
                    ) : (
                      <span className="notification-read-state">{t.read}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ) : null}
    </div>
  );
}
