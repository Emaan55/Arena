"use client";

import { useRef, useState } from "react";
import { ReviewAvatar } from "./reviews/ReviewCard";
import type { PublicFounderReply } from "@/lib/reviewer-profile";
import { FOUNDER_REPLY_MIN, FOUNDER_REPLY_MAX, validateFounderReply } from "@/lib/founder-reply";

export function FounderReviewReply({ reviewId, reply, canReply, onChange }: {
  reviewId: string; reply: PublicFounderReply | null; canReply: boolean;
  onChange: (reply: PublicFounderReply | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const inFlight = useRef(false);
  const canManage = canReply && Boolean(reply?.canManage);

  function edit() {
    setDraft(reply?.body ?? ""); setEditing(true); setConfirmDelete(false); setError(null); setMessage(null);
  }
  async function save(method: "POST" | "PATCH" | "DELETE") {
    if (inFlight.current) return;
    const validated = validateFounderReply(draft);
    if (method !== "DELETE" && validated.error) { setError(validated.error); return; }
    inFlight.current = true; setBusy(true); setError(null); setMessage(null);
    try {
      const response = await fetch(`/api/reviews/${reviewId}/reply`, { method,
        headers: method === "DELETE" ? undefined : { "Content-Type": "application/json" },
        body: method === "DELETE" ? undefined : JSON.stringify({ body: validated.body }),
      });
      const data = await response.json();
      if (!response.ok) { setError(data.error ?? "Could not save your reply."); return; }
      onChange(data.reply); setEditing(false); setConfirmDelete(false);
      setMessage(method === "DELETE" ? "Reply deleted." : method === "POST" ? "Reply published." : "Reply updated.");
    } catch { setError("Network error. Please try again."); }
    finally { inFlight.current = false; setBusy(false); }
  }

  return <div className="ml-3 min-w-0 border-l-2 border-accent/30 pl-3">
    {reply && <div className="flex min-w-0 flex-col gap-2 rounded-lg bg-accent/5 p-2">
      <div className="flex min-w-0 items-center gap-2">
        <ReviewAvatar name={reply.authorName} url={reply.authorAvatarUrl} small />
        <div className="min-w-0">
          <p className="break-words font-semibold text-ink">{reply.authorName}</p>
          <span className="block text-[10px] font-semibold text-accent">Product Owner</span>
          <time className="text-[10px] text-muted" dateTime={reply.updatedAt}>
            {reply.updatedAt !== reply.createdAt ? "Edited " : ""}{new Date(reply.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}
          </time>
        </div>
      </div>
      <p className="whitespace-pre-wrap break-words leading-relaxed text-muted">{reply.body}</p>
      {canManage && !editing && <div className="flex flex-wrap gap-3">
        <button type="button" onClick={edit} disabled={busy} className="font-semibold text-accent hover:underline disabled:opacity-50">Edit reply</button>
        <button type="button" onClick={() => { setConfirmDelete(true); setError(null); setMessage(null); }} disabled={busy} className="text-muted hover:text-danger disabled:opacity-50">Delete reply</button>
      </div>}
    </div>}
    {canReply && !reply && !editing && <button type="button" onClick={edit} className="py-1 font-semibold text-accent hover:underline">Reply as Founder</button>}
    {canReply && editing && <form className="mt-2 flex min-w-0 flex-col gap-2" onSubmit={(event) => { event.preventDefault(); void save(reply ? "PATCH" : "POST"); }}>
      <label htmlFor={`founder-reply-${reviewId}`} className="font-semibold text-ink">{reply ? "Edit founder reply" : "Reply as Founder"}</label>
      <textarea id={`founder-reply-${reviewId}`} value={draft} onChange={(event) => setDraft(event.target.value)} disabled={busy}
        rows={4} maxLength={FOUNDER_REPLY_MAX * 2} placeholder="Respond to this product feedback…"
        className="w-full min-w-0 resize-y rounded-lg border border-border bg-bg p-2 text-xs text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/15" />
      <span className="text-[10px] text-muted">{Array.from(draft.trim()).length}/{FOUNDER_REPLY_MAX} · Minimum {FOUNDER_REPLY_MIN} characters</span>
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={busy || Boolean(validateFounderReply(draft).error)} className="rounded-lg bg-accent px-3 py-2 font-semibold text-accent-ink disabled:opacity-50">{busy ? "Saving…" : reply ? "Save changes" : "Publish reply"}</button>
        <button type="button" disabled={busy} onClick={() => { setEditing(false); setError(null); }} className="rounded-lg border border-border px-3 py-2 text-muted disabled:opacity-50">Cancel</button>
      </div>
    </form>}
    {canManage && confirmDelete && <div className="mt-2 flex flex-wrap items-center gap-2">
      <span className="text-muted">Delete this reply?</span>
      <button type="button" disabled={busy} onClick={() => void save("DELETE")} className="rounded border border-danger px-2 py-1 font-semibold text-danger disabled:opacity-50">{busy ? "Deleting…" : "Confirm delete"}</button>
      <button type="button" disabled={busy} onClick={() => setConfirmDelete(false)} className="text-muted hover:underline">Cancel</button>
    </div>}
    {error && <p role="alert" className="mt-2 break-words text-danger">{error}</p>}
    {message && <p role="status" className="mt-2 text-accent">{message}</p>}
  </div>;
}
