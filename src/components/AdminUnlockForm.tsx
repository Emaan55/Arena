"use client";

import { useState } from "react";
import { ShieldCheck } from "lucide-react";

/** Shared unlock form UI, same look as /admin/favicon-diagnostic and /admin/sponsorships. */
export function AdminUnlockForm({ onUnlock, error }: { onUnlock: (secret: string) => void; error?: string | null }) {
  const [input, setInput] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim()) return;
    onUnlock(input.trim());
  }

  return (
    <main className="flex min-h-[70vh] items-center justify-center px-6">
      <form
        onSubmit={handleSubmit}
        className="flex w-full max-w-sm flex-col gap-3 rounded-2xl border border-border bg-surface p-6 shadow-md"
      >
        <div className="flex items-center gap-2 text-ink">
          <ShieldCheck className="h-5 w-5 text-accent" />
          <span className="font-display text-base font-bold">Admin</span>
        </div>
        <input
          type="password"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Admin key"
          autoFocus
          className="rounded-lg border border-border bg-bg px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-accent focus:outline-none"
        />
        {error && <p className="text-sm text-danger">{error}</p>}
        <button
          type="submit"
          className="rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-accent-ink shadow-sm transition-all duration-150 ease-out hover:-translate-y-0.5 hover:shadow-md active:scale-95"
        >
          Unlock
        </button>
      </form>
    </main>
  );
}
