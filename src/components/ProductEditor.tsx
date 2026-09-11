"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Product } from "@/types/database";
import { editTokenStorageKey } from "@/lib/edit-token-storage";
import { isWithinEditWindow } from "@/lib/edit-window";

const BATTLE_PITCH_MAX = 120;
const WHY_US_MAX = 160;
const DIFFERENTIATOR_MAX = 60;
const PITCH_MAX = 140;

/**
 * Lets a submitter edit their own product's Battle Pitch / Why Us /
 * Differentiators / X handle / pitch, gated by the one-time edit token
 * saved to their browser's localStorage at submission (see
 * SubmitForm.tsx). Renders nothing for anyone else — there's no visible
 * "Edit" affordance at all unless this exact browser holds that product's
 * token, which is the only credential the PATCH endpoint accepts.
 */
export function ProductEditor({
  product,
  defaultOpen = false,
}: {
  product: Product;
  defaultOpen?: boolean;
}) {
  const router = useRouter();
  const [editToken, setEditToken] = useState<string | null>(null);
  const [open, setOpen] = useState(defaultOpen);
  const [pitch, setPitch] = useState(product.pitch);
  const [battlePitch, setBattlePitch] = useState(product.battle_pitch ?? "");
  const [whyUs, setWhyUs] = useState(product.why_us ?? "");
  const [differentiators, setDifferentiators] = useState<string[]>(() => {
    const d = [...product.differentiators];
    while (d.length < 3) d.push("");
    return d;
  });
  const [xHandle, setXHandle] = useState(product.x_handle ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setEditToken(window.localStorage.getItem(editTokenStorageKey(product.id)));
    } catch {
      // localStorage unavailable (private browsing, etc.) — editing simply
      // isn't offered, same as not having the token.
    }
  }, [product.id]);

  if (!editToken) return null;

  const editable = isWithinEditWindow(product.submitted_at);
  if (!editable) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-surface-2 p-4 text-sm text-muted sm:p-5">
        The 24-hour editing window for this product has closed — Battle Pitch, Why Us,
        differentiators, and the X handle are now locked in for the rest of the competition.
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      const res = await fetch(`/api/products/${product.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          editToken,
          pitch,
          battlePitch,
          whyUs,
          differentiators: differentiators.map((d) => d.trim()).filter(Boolean),
          xHandle,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not save changes.");
        return;
      }
      setSuccess(true);
      router.refresh();
    } catch {
      setError("Network error — please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div id="edit-product" className="rounded-xl border border-dashed border-accent/40 bg-accent-soft/5 p-4 sm:p-5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between text-left text-sm font-semibold text-accent"
      >
        Edit your product
        <span className="text-xs font-normal text-muted">{open ? "Hide" : "Update Battle Pitch, X handle, etc."}</span>
      </button>

      {open && (
        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted">One-line pitch</span>
            <input
              value={pitch}
              onChange={(e) => setPitch(e.target.value)}
              maxLength={PITCH_MAX}
              required
              className="rounded-lg border border-border bg-bg px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-accent focus:outline-none"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted">Battle Pitch</span>
            <span className="text-xs text-muted">Make your case. Give voters a reason to choose you.</span>
            <input
              value={battlePitch}
              onChange={(e) => setBattlePitch(e.target.value)}
              maxLength={BATTLE_PITCH_MAX}
              placeholder="What makes this the product to beat?"
              className="rounded-lg border border-border bg-bg px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-accent focus:outline-none"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted">Why Us?</span>
            <input
              value={whyUs}
              onChange={(e) => setWhyUs(e.target.value)}
              maxLength={WHY_US_MAX}
              placeholder="Why should voters pick you over the other side?"
              className="rounded-lg border border-border bg-bg px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-accent focus:outline-none"
            />
          </label>

          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted">
              Key differentiators (up to 3)
            </span>
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
                placeholder={`Differentiator ${i + 1}`}
                className="rounded-lg border border-border bg-bg px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-accent focus:outline-none"
              />
            ))}
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted">X handle</span>
            <span className="text-xs text-muted">Connect your product to its founder.</span>
            <input
              value={xHandle}
              onChange={(e) => setXHandle(e.target.value)}
              placeholder="@yourhandle"
              className="rounded-lg border border-border bg-bg px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-accent focus:outline-none"
            />
          </label>

          {error && <p className="text-sm text-danger">{error}</p>}
          {success && <p className="text-sm text-ink">Saved.</p>}

          <button
            type="submit"
            disabled={saving}
            className="mt-1 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-accent-ink shadow-sm transition-all duration-150 ease-out hover:-translate-y-0.5 hover:shadow-md active:scale-95 disabled:pointer-events-none disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </form>
      )}
    </div>
  );
}
