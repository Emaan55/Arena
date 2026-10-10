"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarClock, CheckCircle2, Loader2, Mail, Send } from "lucide-react";
import { useAdminSecret } from "@/lib/useAdminSecret";
import { AdminUnlockForm } from "@/components/AdminUnlockForm";

type Announcement = {
  id: string;
  title: string;
  body: string;
  status: "draft" | "published";
  email_requested: boolean;
  created_at: string;
  published_at: string | null;
};

type WeeklyDelivery = {
  weekStart: string;
  queued: number;
  sending: number;
  sent: number;
  failed: number;
  skipped: number;
};

export default function AdminAnnouncementsPage() {
  const { secret, unlock, reject } = useAdminSecret();
  const [items, setItems] = useState<Announcement[]>([]);
  const [weeklyDelivery, setWeeklyDelivery] = useState<WeeklyDelivery | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [includeInWeeklyEmail, setIncludeInWeeklyEmail] = useState(false);
  const [preview, setPreview] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (key: string) => {
    const response = await fetch("/api/admin/announcements", { headers: { "x-admin-secret": key }, cache: "no-store" });
    if (response.status === 401) {
      reject();
      throw new Error("Wrong admin key.");
    }
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Could not load announcements.");
    setItems(data.announcements ?? []);
    setWeeklyDelivery(data.weeklyDelivery ?? null);
  }, [reject]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Fetches server data when the saved admin session becomes available.
    if (secret) void load(secret).catch((cause) => setError(cause instanceof Error ? cause.message : "Could not load announcements."));
  }, [secret, load]);

  async function handleUnlock(value: string) {
    setBusy(true);
    setError("");
    try {
      await load(value);
      unlock(value);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not unlock admin.");
    } finally {
      setBusy(false);
    }
  }

  if (!secret) {
    return <><AdminUnlockForm onUnlock={handleUnlock} error={error} />{busy && <p className="pb-8 text-center text-xs text-muted">Checking…</p>}</>;
  }

  const adminSecret = secret;

  async function createDraft() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/announcements", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-secret": adminSecret },
        body: JSON.stringify({ title, body, emailRequested: includeInWeeklyEmail }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not save draft.");
      setTitle("");
      setBody("");
      setIncludeInWeeklyEmail(false);
      setPreview(false);
      await load(adminSecret);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save draft.");
    } finally {
      setBusy(false);
    }
  }

  async function publish(id: string) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/announcements", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-admin-secret": adminSecret },
        body: JSON.stringify({ id, action: "publish" }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not publish announcement.");
      await load(adminSecret);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not publish announcement.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-7 px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-accent">Communication</p>
          <h1 className="mt-2 font-display text-3xl font-black text-ink">Arena announcements</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
            Publish updates in-app immediately. Selected updates are combined into one Monday email for users subscribed to Arena announcements.
          </p>
        </div>
        <button onClick={reject} className="text-sm text-muted hover:text-ink">Lock</button>
      </div>

      {error && <p className="rounded-xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger">{error}</p>}

      <section className="grid gap-4 sm:grid-cols-3">
        <article className="rounded-2xl border border-border bg-surface p-5 shadow-sm sm:col-span-2">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10 text-accent"><CalendarClock className="h-5 w-5" /></div>
            <div><h2 className="text-sm font-bold text-ink">Weekly email schedule</h2><p className="mt-0.5 text-xs text-muted">Every Monday at 8:00 AM Pakistan time</p></div>
          </div>
          <p className="mt-4 text-sm leading-relaxed text-muted">Each subscriber receives one email containing every published announcement marked for the previous week’s digest.</p>
        </article>
        <article className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wide text-muted">Latest weekly delivery</p>
          {weeklyDelivery ? <><p className="mt-3 font-display text-2xl font-black text-ink">{weeklyDelivery.sent} sent</p><p className="mt-1 text-xs text-muted">{weeklyDelivery.queued + weeklyDelivery.sending} queued · {weeklyDelivery.failed} failed · {weeklyDelivery.skipped} unsubscribed</p></> : <p className="mt-3 text-sm text-muted">No weekly email has been generated yet.</p>}
        </article>
      </section>

      <section className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5 shadow-sm sm:p-6">
        <div><h2 className="font-display text-lg font-black text-ink">Create announcement draft</h2><p className="mt-1 text-xs text-muted">Saving a draft sends nothing. You publish it separately after reviewing it.</p></div>
        <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={140} placeholder="Announcement title" className="rounded-xl border border-border bg-bg px-4 py-3 text-sm text-ink outline-none focus:border-accent" />
        <textarea value={body} onChange={(event) => setBody(event.target.value)} maxLength={5000} rows={6} placeholder="Write a concise Arena update…" className="resize-y rounded-xl border border-border bg-bg px-4 py-3 text-sm text-ink outline-none focus:border-accent" />
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-bg p-4">
          <input type="checkbox" checked={includeInWeeklyEmail} onChange={(event) => setIncludeInWeeklyEmail(event.target.checked)} className="mt-0.5 h-4 w-4 accent-[#00b4d8]" />
          <span><strong className="block text-sm text-ink">Include in the next weekly email</strong><span className="mt-1 block text-xs leading-relaxed text-muted">Only users who enabled Arena announcements will receive the email. Everyone still receives the in-app update when it is published.</span></span>
        </label>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setPreview((value) => !value)} className="rounded-xl border border-border px-4 py-2.5 text-sm font-semibold text-ink">{preview ? "Hide preview" : "Preview"}</button>
          <button disabled={busy || !title.trim() || !body.trim()} onClick={() => void createDraft()} className="flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-bold text-accent-ink disabled:opacity-50">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}Save draft</button>
        </div>
        {preview && <article className="rounded-xl border border-accent/30 bg-bg p-5"><span className="text-[10px] font-bold uppercase tracking-wide text-accent">THE ARENA · Preview</span><h3 className="mt-2 font-display text-xl font-bold text-ink">{title || "Announcement title"}</h3><p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-muted">{body || "Announcement body preview"}</p></article>}
      </section>

      <section className="flex flex-col gap-3">
        <div><h2 className="font-display text-xl font-black text-ink">Recent announcements</h2><p className="mt-1 text-xs text-muted">Drafts remain private until you choose Publish once.</p></div>
        {items.length === 0 && <p className="rounded-xl border border-dashed border-border p-6 text-sm text-muted">No announcements yet.</p>}
        {items.map((item) => <article key={item.id} className="rounded-2xl border border-border bg-surface p-5 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-4"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${item.status === "published" ? "bg-emerald-500/10 text-emerald-600" : "bg-surface-2 text-muted"}`}>{item.status}</span>{item.email_requested && <span className="rounded-full bg-accent/10 px-2.5 py-1 text-[10px] font-bold uppercase text-accent">Weekly email</span>}</div><h3 className="mt-3 font-display text-lg font-bold text-ink">{item.title}</h3><p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-muted">{item.body}</p><p className="mt-3 text-[11px] text-muted">{item.published_at ? `Published ${new Date(item.published_at).toLocaleString()}` : `Draft saved ${new Date(item.created_at).toLocaleString()}`}</p></div>{item.status === "draft" && <button disabled={busy} onClick={() => void publish(item.id)} className="flex items-center gap-2 rounded-xl bg-accent px-3.5 py-2.5 text-xs font-bold text-accent-ink disabled:opacity-50"><Send className="h-3.5 w-3.5" />Publish once</button>}{item.status === "published" && <CheckCircle2 className="h-5 w-5 text-emerald-600" />}</div></article>)}
      </section>
    </main>
  );
}

