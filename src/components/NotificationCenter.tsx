"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell, CheckCheck } from "lucide-react";
import { useAuthUser } from "@/lib/useAuthUser";
type Notification = { id: string; title: string; body: string; href: string; read_at: string | null; created_at: string };
export function NotificationCenter() {
  const { user } = useAuthUser();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  async function loadPage(nextPage: number, append = false) {
    setLoading(true);
    try {
      const response = await fetch(`/api/notifications?page=${nextPage}`, { cache: "no-store" });
      if (!response.ok) return;
      const data = await response.json();
      setItems((previous) => append ? [...previous, ...data.notifications] : data.notifications);
      setUnread(data.unreadCount ?? 0); setHasMore(Boolean(data.hasMore)); setPage(nextPage);
    } finally { setLoading(false); }
  }
  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps -- Refresh the user-scoped bell after auth changes.
  useEffect(() => { if (user) void loadPage(0); else { setItems([]); setUnread(0); } }, [user?.id]);
  if (!user) return null;
  async function markRead(id: string) {
    await fetch("/api/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ notificationId: id }) });
    setItems((previous) => previous.map((item) => item.id === id ? { ...item, read_at: new Date().toISOString() } : item));
    setUnread((count) => Math.max(0, count - 1));
  }
  async function markAll() {
    await fetch("/api/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "read_all" }) });
    setItems((previous) => previous.map((item) => ({ ...item, read_at: item.read_at ?? new Date().toISOString() })));
    setUnread(0);
  }
  return <div className="relative">
    <button aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`} aria-expanded={open} onClick={() => { setOpen((value) => !value); if (!open) void loadPage(0); }} className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface text-ink hover:border-accent">
      <Bell className="h-4 w-4" />{unread > 0 && <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-accent px-1 text-[10px] font-bold text-accent-ink">{unread > 99 ? "99+" : unread}</span>}
    </button>
    {open && <div className="absolute right-0 top-11 z-[60] w-[min(92vw,380px)] rounded-xl border border-border bg-bg shadow-xl">
      <div className="flex items-center justify-between border-b border-border px-4 py-3"><h2 className="font-display text-sm font-bold text-ink">Notifications</h2><div className="flex items-center gap-3"><Link href="/dashboard/settings" onClick={() => setOpen(false)} className="text-xs text-muted hover:text-accent">Settings</Link>{unread > 0 && <button onClick={markAll} className="flex items-center gap-1 text-xs text-accent"><CheckCheck size={13} /> Read all</button>}</div></div>
      <div className="max-h-[65vh] overflow-y-auto">{items.length === 0 && !loading ? <p className="p-5 text-sm text-muted">You&apos;re all caught up.</p> : items.map((item) => <Link key={item.id} href={item.href} onClick={() => { if (!item.read_at) void markRead(item.id); setOpen(false); }} className={`block border-b border-border px-4 py-3 hover:bg-surface ${item.read_at ? "" : "bg-accent-soft/5"}`}><div className="flex items-start gap-2"><span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${item.read_at ? "bg-border" : "bg-accent"}`} /><span className="min-w-0"><strong className="block text-sm text-ink">{item.title}</strong><span className="mt-1 block text-xs leading-relaxed text-muted">{item.body}</span><time className="mt-1 block text-[10px] text-muted">{new Date(item.created_at).toLocaleString()}</time></span></div></Link>)}</div>
      <div className="flex items-center justify-between px-4 py-3"><Link href="/dashboard/notifications" onClick={() => setOpen(false)} className="text-xs font-semibold text-accent">View all</Link>{hasMore && <button disabled={loading} onClick={() => void loadPage(page + 1, true)} className="text-xs text-muted disabled:opacity-50">{loading ? "Loading…" : "Load more"}</button>}</div>
    </div>}
  </div>;
}
