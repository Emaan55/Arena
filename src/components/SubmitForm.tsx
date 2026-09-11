"use client";

import { useState } from "react";
import { CATEGORIES, type Category, type Product } from "@/types/database";
import type { ArenaState } from "@/lib/arena-state";
import { editTokenStorageKey } from "@/lib/edit-token-storage";

const BATTLE_PITCH_MAX = 120;
const WHY_US_MAX = 160;
const DIFFERENTIATOR_MAX = 60;

export function SubmitForm({
  onSubmitted,
}: {
  onSubmitted: (product: Product, state: ArenaState) => void;
}) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [category, setCategory] = useState<Category>("General");
  const [pitch, setPitch] = useState("");
  const [battlePitch, setBattlePitch] = useState("");
  const [whyUs, setWhyUs] = useState("");
  const [differentiators, setDifferentiators] = useState(["", "", ""]);
  const [xHandle, setXHandle] = useState("");
  const [showBattleFields, setShowBattleFields] = useState(false);
  const [website, setWebsite] = useState(""); // honeypot — real users never see or fill this
  const [renderedAt] = useState(() => Date.now());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(false);

    try {
      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          url,
          category,
          pitch,
          battlePitch,
          whyUs,
          differentiators: differentiators.map((d) => d.trim()).filter(Boolean),
          xHandle,
          website,
          renderedAt,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        return;
      }
      const product = data.product as Product;
      if (data.editToken && typeof window !== "undefined") {
        try {
          window.localStorage.setItem(editTokenStorageKey(product.id), data.editToken as string);
        } catch {
          // localStorage unavailable — the submitter just won't be able to
          // edit later from this browser; submission itself still succeeded.
        }
      }
      onSubmitted(product, data.state as ArenaState);
      setName("");
      setUrl("");
      setPitch("");
      setBattlePitch("");
      setWhyUs("");
      setDifferentiators(["", "", ""]);
      setXHandle("");
      setSuccess(true);
    } catch {
      setError("Network error — please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      id="submit"
      className="mx-auto flex w-full max-w-xl flex-col gap-3 rounded-2xl border border-border bg-surface p-6 text-left shadow-lg"
    >
      {/* Honeypot: hidden from real users, invisible to screen readers, but
          present in the DOM for bots that blindly fill every field. */}
      <input
        type="text"
        name="website"
        value={website}
        onChange={(e) => setWebsite(e.target.value)}
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="absolute left-[-9999px] h-0 w-0 opacity-0"
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Product name"
          maxLength={80}
          required
          className="rounded-lg border border-border bg-bg px-3 py-2 text-ink placeholder:text-muted transition-colors duration-150 ease-out focus:border-accent focus:outline-none"
        />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as Category)}
          className="rounded-lg border border-border bg-bg px-3 py-2 text-ink transition-colors duration-150 ease-out focus:border-accent focus:outline-none"
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
        className="rounded-lg border border-border bg-bg px-3 py-2 text-ink placeholder:text-muted transition-colors duration-150 ease-out focus:border-accent focus:outline-none"
      />
      <input
        value={pitch}
        onChange={(e) => setPitch(e.target.value)}
        placeholder="One-line pitch (what does it do?)"
        maxLength={140}
        required
        className="rounded-lg border border-border bg-bg px-3 py-2 text-ink placeholder:text-muted transition-colors duration-150 ease-out focus:border-accent focus:outline-none"
      />
      <input
        value={xHandle}
        onChange={(e) => setXHandle(e.target.value)}
        placeholder="X handle (optional) — @yourhandle"
        className="rounded-lg border border-border bg-bg px-3 py-2 text-ink placeholder:text-muted transition-colors duration-150 ease-out focus:border-accent focus:outline-none"
      />
      <p className="-mt-1 text-xs text-muted">Connect your product to its founder.</p>

      <button
        type="button"
        onClick={() => setShowBattleFields((v) => !v)}
        className="self-start text-xs font-semibold text-accent transition-colors duration-150 ease-out hover:text-ink"
      >
        {showBattleFields ? "Hide Battle Pitch (optional)" : "+ Add a Battle Pitch (optional)"}
      </button>

      {showBattleFields && (
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-bg p-4">
          <div className="flex flex-col gap-0.5">
            <span className="text-xs font-bold uppercase tracking-wide text-accent">Battle Pitch</span>
            <span className="text-xs text-muted">Make your case. Give voters a reason to choose you.</span>
          </div>
          <input
            value={battlePitch}
            onChange={(e) => setBattlePitch(e.target.value)}
            maxLength={BATTLE_PITCH_MAX}
            placeholder="What makes this the product to beat?"
            className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted transition-colors duration-150 ease-out focus:border-accent focus:outline-none"
          />
          <input
            value={whyUs}
            onChange={(e) => setWhyUs(e.target.value)}
            maxLength={WHY_US_MAX}
            placeholder="Why Us? Why should voters pick you?"
            className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted transition-colors duration-150 ease-out focus:border-accent focus:outline-none"
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
                className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted transition-colors duration-150 ease-out focus:border-accent focus:outline-none"
              />
            ))}
          </div>
        </div>
      )}

      {error && <p className="text-sm text-danger">{error}</p>}
      {success && (
        <p className="text-sm text-ink">
          You&apos;re in the arena. Watch for your first duel below.
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="mt-1 rounded-lg bg-accent px-4 py-2.5 font-display font-bold text-accent-ink shadow-sm transition-all duration-150 ease-out hover:-translate-y-0.5 hover:shadow-md active:scale-95 disabled:pointer-events-none disabled:opacity-60"
      >
        {submitting ? "Entering the arena…" : "Enter the arena — it's free"}
      </button>
    </form>
  );
}
