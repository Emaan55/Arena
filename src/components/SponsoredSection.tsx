"use client";

import { useEffect, useState } from "react";
import { Megaphone, Sparkles, Crown, Star, Users, ArrowUpRight, Loader2 } from "lucide-react";
import type { SponsorshipState } from "@/lib/sponsorship";
import {
  SPONSOR_DURATIONS,
  SPONSOR_PRICE_LABELS,
  resolveSponsorshipDisplay,
  type SponsorDuration,
} from "@/lib/sponsorship-constants";
import { editTokenStorageKey } from "@/lib/edit-token-storage";
import { CATEGORIES, type Category } from "@/types/database";
import { SponsorLogo } from "./SponsorLogo";
import { PayButton } from "./PayButton";

const EDIT_TOKEN_PREFIX = "arena_edit_token:";
const NAME_MAX = 80;
const DESCRIPTION_MAX = 140;

interface MyProduct {
  id: string;
  name: string;
  category: string;
  pitch: string;
}

/** Scans localStorage for every product this browser holds an edit token
 * for — the same "no accounts, token is ownership" mechanism EditProductButton
 * and ProductEditor use — and resolves each id to a product via the public
 * GET /api/products/[id]. That's how an anonymous submitter picks which of
 * their own Arena products to sponsor. */
function useMyProducts() {
  const [products, setProducts] = useState<MyProduct[] | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      let ids: string[] = [];
      try {
        ids = Object.keys(window.localStorage)
          .filter((k) => k.startsWith(EDIT_TOKEN_PREFIX))
          .map((k) => k.slice(EDIT_TOKEN_PREFIX.length));
      } catch {
        ids = [];
      }

      if (ids.length === 0) {
        if (!cancelled) setProducts([]);
        return;
      }

      const results = await Promise.all(
        ids.map(async (id) => {
          try {
            const res = await fetch(`/api/products/${id}`);
            if (!res.ok) return null;
            const data = await res.json();
            return data.product
              ? { id: data.product.id, name: data.product.name, category: data.product.category, pitch: data.product.pitch }
              : null;
          } catch {
            return null;
          }
        }),
      );

      if (!cancelled) setProducts(results.filter((p): p is MyProduct => p !== null));
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return products;
}

function timeLeft(endsAt: string | null): string | null {
  if (!endsAt) return null;
  const ms = new Date(endsAt).getTime() - Date.now();
  if (ms <= 0) return null;
  const days = Math.ceil(ms / (24 * 60 * 60 * 1000));
  return days === 1 ? "1 day left" : `${days} days left`;
}

const inputClass =
  "rounded-lg border border-border bg-bg px-3 py-2 text-xs text-ink placeholder:text-muted focus:border-accent focus:outline-none";

/** "Add External Product" fields — any URL, never added to the Arena. Name
 * and favicon are best-effort auto-detected from the URL (POST
 * /api/sponsorship/resolve-url), always editable, never required to match. */
function useExternalProductForm() {
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [nameTouched, setNameTouched] = useState(false);
  const [category, setCategory] = useState<Category>("General");
  const [description, setDescription] = useState("");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [detecting, setDetecting] = useState(false);

  useEffect(() => {
    if (!url.includes(".")) return;
    const normalized = url.trim();
    const t = setTimeout(async () => {
      setDetecting(true);
      try {
        const res = await fetch("/api/sponsorship/resolve-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: normalized }),
        });
        const data = await res.json();
        if (res.ok) {
          if (data.name && !nameTouched) setName(data.name);
          setLogoUrl(data.logoUrl ?? null);
        }
      } catch {
        // best-effort only — the sponsor can still fill everything by hand
      } finally {
        setDetecting(false);
      }
    }, 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  return {
    url,
    setUrl,
    name,
    setName: (v: string) => {
      setNameTouched(true);
      setName(v);
    },
    category,
    setCategory,
    description,
    setDescription,
    logoUrl,
    detecting,
  };
}

export function SponsoredSection({
  sponsorship,
  onPaid,
}: {
  sponsorship: SponsorshipState;
  onPaid?: () => void;
}) {
  const myProducts = useMyProducts();
  const [mode, setMode] = useState<"arena" | "external">("arena");
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [duration, setDuration] = useState<SponsorDuration>(7);
  const ext = useExternalProductForm();

  useEffect(() => {
    if (myProducts && myProducts.length > 0 && !selectedProductId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedProductId(myProducts[0].id);
    }
    if (myProducts && myProducts.length === 0) {
      setMode("external");
    }
  }, [myProducts, selectedProductId]);

  const editToken =
    mode === "arena" && selectedProductId && typeof window !== "undefined"
      ? window.localStorage.getItem(editTokenStorageKey(selectedProductId))
      : null;

  const { active, queue } = sponsorship;
  const remaining = active ? timeLeft(active.ends_at) : null;
  const activeDisplay = active ? resolveSponsorshipDisplay(active) : null;
  const nextUpDisplay = queue[0] ? resolveSponsorshipDisplay(queue[0]) : null;

  const externalReady =
    ext.name.trim().length > 0 &&
    ext.name.trim().length <= NAME_MAX &&
    ext.url.trim().length > 0 &&
    ext.description.trim().length > 0 &&
    ext.description.trim().length <= DESCRIPTION_MAX;

  return (
    <section className="relative border-t border-border px-6 py-16 md:px-10">
      <div className="mx-auto max-w-6xl">
        {queue.length > 0 && (
          <div className="mb-6 flex justify-end sm:absolute sm:right-6 sm:top-16 sm:mb-0 md:right-10">
            <span className="flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-medium text-muted shadow-sm">
              <Users className="h-3.5 w-3.5 text-accent" />
              {queue.length} in queue
              {nextUpDisplay && (
                <>
                  <span className="text-border-strong">·</span>
                  Next up: {nextUpDisplay.name}
                </>
              )}
              <ArrowUpRight className="h-3.5 w-3.5" />
            </span>
          </div>
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[320px_1fr]">
          {/* Compact left column: pitch + pricing */}
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-accent/20 bg-accent-soft/15 text-accent">
                  <Megaphone className="h-5 w-5" />
                  <Sparkles className="absolute -right-1 -top-1 h-3.5 w-3.5 text-accent" />
                </span>
                <div className="flex flex-col gap-1">
                  <span className="font-display text-base font-bold text-ink">Sponsored</span>
                  <span className="flex w-fit items-center gap-1 rounded-full border border-border bg-surface-2 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
                    <Star className="h-3 w-3 text-accent" fill="currentColor" />1 sponsor at a time
                  </span>
                </div>
              </div>
              <h3 className="font-display text-lg font-bold leading-snug text-accent">
                Put your product in front of builders.
              </h3>
              <p className="text-sm leading-relaxed text-muted">
                Get your product featured on our platform and reach a community of active
                builders. One spot at a time.
              </p>
            </div>

            <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 shadow-md">
              <div className="flex items-center gap-2">
                <Crown className="h-4 w-4 text-accent" />
                <span className="text-sm font-bold text-ink">Sponsorship Plans</span>
              </div>
              <p className="-mt-2 text-xs text-muted">Choose how long you want to be featured.</p>

              <div className="grid grid-cols-3 gap-2">
                {SPONSOR_DURATIONS.map((days) => (
                  <button
                    key={days}
                    onClick={() => setDuration(days)}
                    className={`flex flex-col items-center gap-0.5 rounded-lg border px-2 py-2.5 text-center transition-all duration-150 ease-out active:scale-95 ${
                      duration === days
                        ? "border-accent bg-accent-soft/10 text-ink"
                        : "border-border text-muted hover:border-border-strong hover:text-ink"
                    }`}
                  >
                    <span className="text-xs font-semibold">{days} Days</span>
                    <span className="font-mono text-sm font-bold">{SPONSOR_PRICE_LABELS[days]}</span>
                  </button>
                ))}
              </div>

              {/* Any product can be sponsored — one already in the Arena
                  (proven by the same edit token used to edit it), or any
                  external URL. Either way this is always a paid slot; only
                  the founder can grant a free one, from /admin/sponsorships. */}
              <div className="grid grid-cols-2 gap-1 rounded-lg border border-border bg-surface-2 p-1">
                <button
                  onClick={() => setMode("arena")}
                  className={`rounded-md px-2 py-1.5 text-xs font-semibold transition-colors duration-150 ${
                    mode === "arena" ? "bg-accent text-accent-ink" : "text-muted hover:text-ink"
                  }`}
                >
                  Arena Product
                </button>
                <button
                  onClick={() => setMode("external")}
                  className={`rounded-md px-2 py-1.5 text-xs font-semibold transition-colors duration-150 ${
                    mode === "external" ? "bg-accent text-accent-ink" : "text-muted hover:text-ink"
                  }`}
                >
                  External Product
                </button>
              </div>

              {mode === "arena" ? (
                myProducts === null ? null : myProducts.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-border bg-surface-2 p-3 text-center text-xs text-muted">
                    Submit a product first, then come back here to sponsor it — or sponsor an
                    external product above.
                  </p>
                ) : (
                  <>
                    {myProducts.length > 1 && (
                      <select
                        value={selectedProductId ?? ""}
                        onChange={(e) => setSelectedProductId(e.target.value)}
                        className={inputClass}
                      >
                        {myProducts.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    )}
                    {selectedProductId && editToken ? (
                      <PayButton
                        type="sponsor"
                        productId={selectedProductId}
                        endpoint="/api/sponsorship/checkout"
                        extraBody={{ editToken, durationDays: duration }}
                        label="Sponsor Now"
                        onPaid={onPaid}
                        className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-ink px-3 py-2.5 text-sm font-semibold text-bg shadow-sm transition-all duration-150 ease-out hover:-translate-y-0.5 hover:shadow-md active:scale-95 disabled:pointer-events-none disabled:opacity-50"
                      />
                    ) : null}
                  </>
                )
              ) : (
                <div className="flex flex-col gap-2">
                  <input
                    value={ext.url}
                    onChange={(e) => ext.setUrl(e.target.value)}
                    placeholder="https://yourproduct.com"
                    className={inputClass}
                  />
                  <div className="flex items-center gap-2">
                    {ext.detecting ? (
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-2">
                        <Loader2 className="h-4 w-4 animate-spin text-muted" />
                      </span>
                    ) : (
                      <SponsorLogo logoUrl={ext.logoUrl} name={ext.name || "?"} className="h-9 w-9" />
                    )}
                    <input
                      value={ext.name}
                      onChange={(e) => ext.setName(e.target.value)}
                      placeholder="Product name"
                      maxLength={NAME_MAX}
                      className={`${inputClass} flex-1`}
                    />
                  </div>
                  <select
                    value={ext.category}
                    onChange={(e) => ext.setCategory(e.target.value as Category)}
                    className={inputClass}
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                  <input
                    value={ext.description}
                    onChange={(e) => ext.setDescription(e.target.value)}
                    placeholder="Short description"
                    maxLength={DESCRIPTION_MAX}
                    className={inputClass}
                  />
                  {externalReady ? (
                    <PayButton
                      type="sponsor"
                      endpoint="/api/sponsorship/checkout"
                      extraBody={{
                        durationDays: duration,
                        isExternal: "1",
                        externalName: ext.name.trim(),
                        externalUrl: ext.url.trim(),
                        externalCategory: ext.category,
                        externalDescription: ext.description.trim(),
                      }}
                      label="Sponsor Now"
                      onPaid={onPaid}
                      className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-ink px-3 py-2.5 text-sm font-semibold text-bg shadow-sm transition-all duration-150 ease-out hover:-translate-y-0.5 hover:shadow-md active:scale-95 disabled:pointer-events-none disabled:opacity-50"
                    />
                  ) : (
                    <button
                      disabled
                      className="w-full rounded-lg bg-surface-2 px-3 py-2.5 text-sm font-semibold text-muted opacity-60"
                    >
                      Sponsor Now
                    </button>
                  )}
                </div>
              )}
              <p className="text-center text-[10px] text-muted">Only one product is featured at a time.</p>
            </div>
          </div>

          {/* Dominant right column: the featured product */}
          <div className="flex flex-col justify-center rounded-2xl border border-border bg-surface p-6 shadow-lg sm:p-8">
            {activeDisplay ? (
              <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-center sm:gap-8">
                <span className="flex w-fit items-center gap-1 rounded-full border border-accent/30 bg-accent-soft/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-accent sm:hidden">
                  <Star className="h-3 w-3" fill="currentColor" />
                  Featured Sponsor
                </span>
                <SponsorLogo logoUrl={activeDisplay.logoUrl} name={activeDisplay.name} />
                <div className="flex min-w-0 flex-col gap-2">
                  <span className="hidden w-fit items-center gap-1 rounded-full border border-accent/30 bg-accent-soft/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-accent sm:flex">
                    <Star className="h-3 w-3" fill="currentColor" />
                    Featured Sponsor
                  </span>
                  <h2 className="font-display text-2xl font-black text-ink sm:text-4xl">{activeDisplay.name}</h2>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="flex items-center gap-1 rounded-full bg-accent px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-accent-ink">
                      <Star className="h-3 w-3" fill="currentColor" />
                      Sponsored
                    </span>
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                      {activeDisplay.category}
                    </span>
                    {remaining && <span className="text-xs text-muted">· {remaining}</span>}
                  </div>
                  <p className="max-w-xl text-sm leading-relaxed text-muted sm:text-base">{activeDisplay.description}</p>
                  <a
                    href={activeDisplay.url}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="mt-1 flex w-fit items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-4 py-2 text-sm font-semibold text-ink shadow-none transition-all duration-150 ease-out hover:-translate-y-0.5 hover:border-accent hover:text-accent active:scale-95"
                  >
                    Visit Product ↗
                  </a>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 py-6 text-center">
                <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-dashed border-accent/40 bg-accent-soft/10 text-accent">
                  <Megaphone className="h-6 w-6" />
                </span>
                <h2 className="font-display text-xl font-bold text-ink">This spot is open</h2>
                <p className="max-w-sm text-sm text-muted">
                  Be the first featured sponsor — your product goes live here the moment you sponsor it.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
