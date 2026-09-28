"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Plus } from "lucide-react";
import { useAdminSecret } from "@/lib/useAdminSecret";
import { AdminUnlockForm } from "@/components/AdminUnlockForm";
import { CATEGORIES, type Category } from "@/types/database";

const BATTLE_PITCH_MAX = 120;
const WHY_US_MAX = 160;
const DIFFERENTIATOR_MAX = 60;

/**
 * Admin-only free product submission — no $1 payment, no vote/review
 * requirement, gated purely by the shared admin secret (same as every
 * other admin page). Posts to /api/admin/products, which runs through the
 * exact same createArenaProduct() as the public paid/earned paths.
 */
export default function AdminSubmitProductPage() {
  const { secret, unlock, reject } = useAdminSecret();
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [category, setCategory] = useState<Category>("General");
  const [pitch, setPitch] = useState("");
  const [battlePitch, setBattlePitch] = useState("");
  const [whyUs, setWhyUs] = useState("");
  const [differentiators, setDifferentiators] = useState(["", "", ""]);
  const [xHandle, setXHandle] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleUnlock(value: string) {
    setError(null);
    try {
      const res = await fetch("/api/admin/sponsorships", { headers: { "x-admin-secret": value } });
      if (res.status === 401) {
        setError("Wrong admin key.");
        return;
      }
      unlock(value);
    } catch {
      setError("Network error, please try again.");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!secret) return;
    setSubmitting(true);
    setSubmitError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/admin/products", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-secret": secret },
        body: JSON.stringify({
          name,
          url,
          category,
          pitch,
          battlePitch,
          whyUs,
          differentiators: differentiators.map((d) => d.trim()).filter(Boolean),
          xHandle,
        }),
      });
      const data = await res.json();
      if (res.status === 401) {
        reject();
        return;
      }
      if (!res.ok) {
        setSubmitError(data.error ?? "Could not submit product.");
        return;
      }
      setSuccess(`${data.product.name} entered the arena.`);
      setName("");
      setUrl("");
      setPitch("");
      setBattlePitch("");
      setWhyUs("");
      setDifferentiators(["", "", ""]);
      setXHandle("");
    } catch {
      setSubmitError("Network error, please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!secret) return <AdminUnlockForm onUnlock={handleUnlock} error={error} />;

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-6 px-6 py-12">
      <Link href="/admin" className="flex items-center gap-1.5 text-sm text-muted hover:text-accent">
        <ArrowLeft className="h-4 w-4" />
        Admin
      </Link>

      <div>
        <h1 className="font-display text-xl font-bold text-ink">Submit a product (free)</h1>
        <p className="text-sm text-muted">
          Admin-only. Skips the $1 payment and the vote/review requirement — everything else (category,
          pairing, validation) works exactly like a normal submission.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-6 shadow-sm">
        <div className="grid gap-3 sm:grid-cols-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Product name"
            maxLength={80}
            required
            className="rounded-lg border border-border bg-bg px-3 py-2 text-sm text-ink placeholder:text-muted"
          />
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as Category)}
            className="rounded-lg border border-border bg-bg px-3 py-2 text-sm text-ink"
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://yourproduct.com"
          required
          className="rounded-lg border border-border bg-bg px-3 py-2 text-sm text-ink placeholder:text-muted"
        />
        <input
          value={pitch}
          onChange={(e) => setPitch(e.target.value)}
          placeholder="One-line pitch (what does it do?)"
          maxLength={140}
          required
          className="rounded-lg border border-border bg-bg px-3 py-2 text-sm text-ink placeholder:text-muted"
        />
        <input
          value={xHandle}
          onChange={(e) => setXHandle(e.target.value)}
          placeholder="X handle (optional): @yourhandle"
          className="rounded-lg border border-border bg-bg px-3 py-2 text-sm text-ink placeholder:text-muted"
        />
        <input
          value={battlePitch}
          onChange={(e) => setBattlePitch(e.target.value)}
          maxLength={BATTLE_PITCH_MAX}
          placeholder="Battle Pitch (optional)"
          className="rounded-lg border border-border bg-bg px-3 py-2 text-sm text-ink placeholder:text-muted"
        />
        <input
          value={whyUs}
          onChange={(e) => setWhyUs(e.target.value)}
          maxLength={WHY_US_MAX}
          placeholder="Why Us? (optional)"
          className="rounded-lg border border-border bg-bg px-3 py-2 text-sm text-ink placeholder:text-muted"
        />
        <div className="flex flex-col gap-2">
          {differentiators.map((d, i) => (
            <input
              key={i}
              value={d}
              onChange={(e) => {
                const next = [...differentiators];
                next[i] = e.target.value;
                setDifferentiators(next);
              }}
              maxLength={DIFFERENTIATOR_MAX}
              placeholder={`Key differentiator ${i + 1} (optional)`}
              className="rounded-lg border border-border bg-bg px-3 py-2 text-sm text-ink placeholder:text-muted"
            />
          ))}
        </div>

        {submitError && <p className="text-sm text-danger">{submitError}</p>}
        {success && <p className="text-sm text-ink">{success}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="mt-1 flex w-fit items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
          {submitting ? "Submitting…" : "Submit for free"}
        </button>
      </form>
    </main>
  );
}
