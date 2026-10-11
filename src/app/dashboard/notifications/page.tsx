"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCheck, Trash2 } from "lucide-react";

type Item = { id: string; title: string; body: string; href: string; read_at: string | null; created_at: string };

export default function NotificationsPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [unread, setUnread] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  async function load(nextPage: number, append = false) {
    setBusy(true);
    try {
      const response = await fetch(`/api/notifications?page=${nextPage}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setItems((current) => append ? [...current, ...data.notifications] : data.notifications);
      setPage(nextPage);
      setHasMore(data.hasMore);
      setUnread(data.unreadCount);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load notifications.");
    } finally {
      setBusy(false);
    }
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect -- Load server data after mount.
  useEffect(() => { void load(0); }, []);

  async function markRead(item: Item) {
    if (item.read_at) return;
    const response = await fetch("/api/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ notificationId: item.id }) });
    if (!response.ok) return;
    setItems((current) => current.map((candidate) => candidate.id === item.id ? { ...candidate, read_at: new Date().toISOString() } : candidate));
    setUnread((count) => Math.max(0, count - 1));
  }

  async function readAll() {
    const response = await fetch("/api/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "read_all" }) });
    if (!response.ok) return;
    setItems((current) => current.map((item) => ({ ...item, read_at: item.read_at ?? new Date().toISOString() })));
    setUnread(0);
    window.dispatchEvent(new Event("arena-notifications-changed"));
  }

  async function remove(item: Item) {
    setDeleting(item.id);
    const response = await fetch("/api/notifications", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ notificationId: item.id }) });
    if (response.ok) {
      setItems((current) => current.filter((candidate) => candidate.id !== item.id));
      if (!item.read_at) setUnread((count) => Math.max(0, count - 1));
      window.dispatchEvent(new Event("arena-notifications-changed"));
    } else {
      setError("Could not delete notification.");
    }
    setDeleting(null);
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="font-display text-3xl font-black text-ink">Notifications</h1><p className="mt-1 text-sm text-muted">{unread} unread</p></div>
        {unread > 0 && <button type="button" onClick={() => void readAll()} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-semibold text-accent"><CheckCheck className="h-4 w-4" /> Mark all as read</button>}
      </div>
      {error && <p className="rounded-xl border border-danger/25 bg-danger/5 p-4 text-sm text-danger">{error}{error.includes("Sign in") && <Link href="/auth/sign-in?next=%2Fdashboard%2Fnotifications" className="ml-2 underline">Sign in</Link>}</p>}
      <section className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
        {items.length === 0 && !busy ? <p className="p-10 text-center text-sm text-muted">You&apos;re all caught up.</p> : <div className="divide-y divide-border">{items.map((item) => (
          <article key={item.id} className={`flex items-start gap-3 p-4 ${item.read_at ? "" : "bg-accent/5"}`}>
            <span className={`mt-2 h-2 w-2 shrink-0 rounded-full ${item.read_at ? "bg-border-strong" : "bg-accent"}`} />
            <Link href={item.href} onClick={() => void markRead(item)} className="min-w-0 flex-1 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent">
              <strong className="text-sm text-ink">{item.title}</strong>
              <p className="mt-1 text-sm leading-6 text-muted">{item.body}</p>
              <time className="mt-2 block text-[10px] text-muted">{new Date(item.created_at).toLocaleString()}</time>
            </Link>
            <button type="button" disabled={deleting === item.id} onClick={() => void remove(item)} aria-label={`Delete ${item.title}`} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-danger/10 hover:text-danger disabled:opacity-50"><Trash2 className="h-4 w-4" /></button>
          </article>
        ))}</div>}
      </section>
      {hasMore && <button disabled={busy} onClick={() => void load(page + 1, true)} className="self-center rounded-lg border border-border px-4 py-2 text-sm text-ink">{busy ? "Loading…" : "Load older"}</button>}
    </main>
  );
}
