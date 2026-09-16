"use client";

import { useEffect, useState } from "react";
import { Megaphone, Sparkles, Crown, Star, Users, ArrowUpRight, Loader2, Shield } from "lucide-react";
import type { SponsorshipState } from "@/lib/sponsorship";
import {
  SPONSOR_DURATIONS,
  SPONSOR_PRICE_LABELS,
  resolveSponsorshipDisplay,
  type SponsorDuration,
} from "@/lib/sponsorship-constants";
import { guessFaviconUrl } from "@/lib/url";
import { CATEGORIES, type Category } from "@/types/database";
import { ProductAvatar } from "./ProductAvatar";
import { PayButton } from "./PayButton";
import { XHandleLink } from "./XHandleLink";

// Matches the sponsor-context chrome the old bespoke SponsorLogo component
// used (thicker accent border, larger radius) — ProductAvatar is now the
// single shared favicon/fallback implementation everywhere, this is just
// its className override for this one visual treatment.
const SPONSOR_LOGO_BASE =
  "flex shrink-0 items-center justify-center overflow-hidden rounded-2xl border-2 border-accent bg-surface-2";

const NAME_MAX = 80;
const DESCRIPTION_MAX = 140;
const inputClass =
  "rounded-lg border border-border bg-bg px-3 py-2 text-xs text-ink placeholder:text-muted focus:border-accent focus:outline-none";

interface ArenaProduct {
  id: string;
  name: string;
  category: string;
  url: string;
  pitch: string;
  logo_url: string | null;
}

/** Anyone can sponsor any listed Arena product — this is the whole
 * catalog (GET /api/products), not just what the visitor's browser
 * happens to hold an edit token for. Debounced so typing to filter
 * doesn't fire a request per keystroke; the very first (empty-query)
 * load fires immediately. */
function useArenaProducts(query: string) {
  const [products, setProducts] = useState<ArenaProduct[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(
      async () => {
        try {
          const res = await fetch(`/api/products${query.trim() ? `?q=${encodeURIComponent(query.trim())}` : ""}`);
          const data = await res.json();
          if (!cancelled) setProducts(res.ok ? (data.products ?? []) : []);
        } catch {
          if (!cancelled) setProducts([]);
        }
      },
      query ? 300 : 0,
    );
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query]);

  return products;
}

function timeLeft(endsAt: string | null): string | null {
  if (!endsAt) return null;
  const ms = new Date(endsAt).getTime() - Date.now();
  if (ms <= 0) return null;
  const days = Math.ceil(ms / (24 * 60 * 60 * 1000));
  return days === 1 ? "1 day left" : `${days} days left`;
}

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
  const [duration, setDuration] = useState<SponsorDuration>(7);
  const [mode, setMode] = useState<"arena" | "external">("arena");

  const [arenaQuery, setArenaQuery] = useState("");
  const arenaProducts = useArenaProducts(arenaQuery);
  const [selectedArenaProduct, setSelectedArenaProduct] = useState<ArenaProduct | null>(null);

  const ext = useExternalProductForm();
  const [xHandle, setXHandle] = useState("");

  useEffect(() => {
    if (arenaProducts && arenaProducts.length === 0 && !arenaQuery) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMode("external");
    }
  }, [arenaProducts, arenaQuery]);

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

  // STEP 3 is complete — a product has actually been chosen — only then do
  // the founder X handle field, review summary, and payment appear.
  const productChosen = mode === "arena" ? selectedArenaProduct !== null : externalReady;
  const reviewName = mode === "arena" ? selectedArenaProduct?.name : ext.name;
  const reviewCategory = mode === "arena" ? selectedArenaProduct?.category : ext.category;
  const reviewLogoUrl =
    mode === "arena"
      ? (selectedArenaProduct ? (selectedArenaProduct.logo_url ?? guessFaviconUrl(selectedArenaProduct.url)) : null)
      : ext.logoUrl;

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

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_1fr] lg:items-center">
          {/* Compact left column: pitch + step-by-step sponsorship flow */}
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2.5">
                <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-accent/20 bg-accent-soft/15 text-accent">
                  <Megaphone className="h-4 w-4" />
                  <Sparkles className="absolute -right-1 -top-1 h-3 w-3 text-accent" />
                </span>
                <div className="flex flex-col gap-0.5">
                  <span className="font-display text-sm font-bold text-ink">Sponsored</span>
                  <span className="flex w-fit items-center gap-1 rounded-full border border-border bg-surface-2 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted">
                    <Star className="h-2.5 w-2.5 text-accent" fill="currentColor" />1 sponsor at a time
                  </span>
                </div>
              </div>
              <h3 className="font-display text-sm font-bold leading-snug text-accent">
                Put your product in front of builders.
              </h3>
              <p className="text-xs leading-relaxed text-muted">
                Get your product featured on our platform and reach a community of active
                builders. One spot at a time.
              </p>
            </div>

            <div className="flex flex-col gap-2.5 rounded-2xl border border-border bg-surface p-3.5 shadow-md">
              {/* Step 1 — duration */}
              <div className="flex items-center gap-1.5">
                <Crown className="h-3.5 w-3.5 text-accent" />
                <span className="text-xs font-bold text-ink">Sponsorship Plans</span>
              </div>
              <p className="-mt-1.5 text-[10px] text-muted">Choose how long you want to be featured.</p>
              <div className="grid grid-cols-3 gap-1.5">
                {SPONSOR_DURATIONS.map((days) => (
                  <button
                    key={days}
                    onClick={() => setDuration(days)}
                    className={`flex flex-col items-center gap-0.5 rounded-lg border px-2 py-1.5 text-center transition-all duration-150 ease-out active:scale-95 ${
                      duration === days
                        ? "border-accent bg-accent-soft/10 text-ink"
                        : "border-border text-muted hover:border-border-strong hover:text-ink"
                    }`}
                  >
                    <span className="text-[11px] font-semibold">{days} Days</span>
                    <span className="font-mono text-xs font-bold">{SPONSOR_PRICE_LABELS[days]}</span>
                  </button>
                ))}
              </div>

              {/* Step 2 — product type */}
              <div className="grid grid-cols-2 gap-1 rounded-lg border border-border bg-surface-2 p-1">
                <button
                  onClick={() => setMode("arena")}
                  className={`rounded-md px-2 py-1 text-xs font-semibold transition-colors duration-150 ${
                    mode === "arena" ? "bg-accent text-accent-ink" : "text-muted hover:text-ink"
                  }`}
                >
                  Arena Product
                </button>
                <button
                  onClick={() => setMode("external")}
                  className={`rounded-md px-2 py-1 text-xs font-semibold transition-colors duration-150 ${
                    mode === "external" ? "bg-accent text-accent-ink" : "text-muted hover:text-ink"
                  }`}
                >
                  External Product
                </button>
              </div>

              {/* Step 3 — pick/enter the product. Payment never appears
                  before this step is complete. */}
              {mode === "arena" ? (
                selectedArenaProduct ? (
                  <div className="flex items-center justify-between gap-2 rounded-lg border border-accent bg-accent-soft/10 p-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <ProductAvatar
                        logoUrl={selectedArenaProduct.logo_url ?? guessFaviconUrl(selectedArenaProduct.url)}
                        name={selectedArenaProduct.name}
                        glow
                        padded
                        className={`h-8 w-8 ${SPONSOR_LOGO_BASE}`}
                      />
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate text-xs font-semibold text-ink">{selectedArenaProduct.name}</span>
                        <span className="text-[10px] text-muted">{selectedArenaProduct.category}</span>
                      </span>
                    </div>
                    <button
                      onClick={() => setSelectedArenaProduct(null)}
                      className="shrink-0 text-[10px] font-semibold text-accent hover:text-ink"
                    >
                      Change
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    <span className="text-xs font-semibold text-ink">Select an Arena product</span>
                    <input
                      value={arenaQuery}
                      onChange={(e) => setArenaQuery(e.target.value)}
                      placeholder="Search Arena products…"
                      className={inputClass}
                    />
                    <div className="flex max-h-40 flex-col gap-1 overflow-y-auto rounded-lg border border-border bg-surface-2 p-1">
                      {arenaProducts === null ? (
                        <p className="p-3 text-center text-xs text-muted">Loading…</p>
                      ) : arenaProducts.length === 0 ? (
                        <p className="p-3 text-center text-xs text-muted">
                          No Arena products found — try External Product instead.
                        </p>
                      ) : (
                        arenaProducts.map((p) => (
                          <button
                            key={p.id}
                            onClick={() => setSelectedArenaProduct(p)}
                            className="flex items-center gap-2 rounded-md p-2 text-left transition-colors duration-150 ease-out hover:bg-surface"
                          >
                            <ProductAvatar
                              logoUrl={p.logo_url ?? guessFaviconUrl(p.url)}
                              name={p.name}
                              glow
                              padded
                              className={`h-8 w-8 ${SPONSOR_LOGO_BASE}`}
                            />
                            <span className="flex min-w-0 flex-1 flex-col">
                              <span className="truncate text-xs font-semibold text-ink">{p.name}</span>
                              <span className="text-[10px] text-muted">{p.category}</span>
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
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
                      <ProductAvatar
                        logoUrl={ext.logoUrl}
                        name={ext.name || "?"}
                        glow
                        padded
                        className={`h-9 w-9 ${SPONSOR_LOGO_BASE}`}
                      />
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
                </div>
              )}

              {/* Step 4 — founder X handle, step 5 — review, step 6 — pay.
                  None of this renders until a product is actually chosen. */}
              {productChosen && (
                <div className="flex flex-col gap-2 border-t border-border pt-2.5">
                  <input
                    value={xHandle}
                    onChange={(e) => setXHandle(e.target.value)}
                    placeholder="@yourhandle"
                    className={inputClass}
                  />
                  <p className="-mt-1 text-[10px] text-muted">Founder X handle (optional)</p>

                  <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-2 p-2">
                    <ProductAvatar
                      logoUrl={reviewLogoUrl ?? null}
                      name={reviewName ?? "?"}
                      glow
                      padded
                      className={`h-8 w-8 ${SPONSOR_LOGO_BASE}`}
                    />
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-xs font-semibold text-ink">{reviewName}</span>
                      <span className="text-[10px] text-muted">
                        {reviewCategory} · {duration} days — {SPONSOR_PRICE_LABELS[duration]}
                      </span>
                    </div>
                  </div>

                  <PayButton
                    type="sponsor"
                    productId={mode === "arena" ? selectedArenaProduct?.id : undefined}
                    endpoint="/api/sponsorship/checkout"
                    extraBody={
                      mode === "arena"
                        ? { durationDays: duration, xHandle: xHandle.trim() }
                        : {
                            durationDays: duration,
                            isExternal: "1",
                            externalName: ext.name.trim(),
                            externalUrl: ext.url.trim(),
                            externalCategory: ext.category,
                            externalDescription: ext.description.trim(),
                            xHandle: xHandle.trim(),
                          }
                    }
                    label="Sponsor Now"
                    onPaid={onPaid}
                    className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-ink px-3 py-2 text-sm font-semibold text-bg shadow-sm transition-all duration-150 ease-out hover:-translate-y-0.5 hover:shadow-md active:scale-95 disabled:pointer-events-none disabled:opacity-50"
                  />
                </div>
              )}

              <p className="text-center text-[9px] text-muted">Only one product is featured at a time.</p>
            </div>
          </div>

          {/* Dominant right column: a compact horizontal banner, never
              stretched to match the left column's height (see
              `lg:items-center` on the grid above) — content is vertically
              centered within its own short, fitted box instead of padding
              out to fill available space. */}
          <div className="relative overflow-hidden rounded-2xl border border-border bg-surface p-4 shadow-lg sm:p-5">
            {/* Decorative sponsorship marks — clipped to the card, purely
                ornamental, never part of the readable content. */}
            <Shield
              className="pointer-events-none absolute -right-5 -top-6 h-24 w-24 rotate-12 text-accent/[0.07]"
              aria-hidden="true"
            />
            <Sparkles
              className="pointer-events-none absolute -bottom-3 -left-3 h-14 w-14 -rotate-12 text-accent/[0.08]"
              aria-hidden="true"
            />
            <svg
              className="pointer-events-none absolute bottom-0 right-0 h-16 w-32 text-accent/[0.08]"
              viewBox="0 0 128 64"
              fill="none"
              aria-hidden="true"
            >
              <path d="M0 60 Q 64 -10 128 40" stroke="currentColor" strokeWidth="1.5" />
            </svg>

            {activeDisplay ? (
              <div className="relative flex items-center gap-3 sm:gap-5">
                <ProductAvatar
                  logoUrl={activeDisplay.logoUrl}
                  name={activeDisplay.name}
                  glow
                  padded
                  className={`h-16 w-16 sm:h-20 sm:w-20 ${SPONSOR_LOGO_BASE}`}
                />
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <h2 className="truncate font-display text-lg font-black text-ink sm:text-2xl">{activeDisplay.name}</h2>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="flex items-center gap-1 rounded-full border border-accent/30 bg-accent-soft/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-accent">
                      <Star className="h-2.5 w-2.5" fill="currentColor" />
                      Featured Sponsor
                    </span>
                    <span className="flex items-center gap-1 rounded-full bg-accent px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-accent-ink">
                      <Star className="h-2.5 w-2.5" fill="currentColor" />
                      Sponsored
                    </span>
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">
                      {activeDisplay.category}
                    </span>
                    {remaining && <span className="text-[10px] text-muted">· {remaining}</span>}
                  </div>
                  <p className="line-clamp-1 max-w-xl text-xs text-muted sm:text-sm">{activeDisplay.description}</p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2.5">
                    <a
                      href={activeDisplay.url}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className="flex w-fit items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-xs font-semibold text-ink shadow-none transition-all duration-150 ease-out hover:-translate-y-0.5 hover:border-accent hover:text-accent active:scale-95"
                    >
                      Visit Product ↗
                    </a>
                    {activeDisplay.founderName && (
                      <span className="text-[10px] text-muted">By {activeDisplay.founderName}</span>
                    )}
                    <XHandleLink handle={activeDisplay.xHandle} className="text-[10px] text-muted transition-colors duration-150 ease-out hover:text-accent" />
                  </div>
                </div>
              </div>
            ) : (
              <div className="relative flex items-center gap-3">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-dashed border-accent/40 bg-accent-soft/10 text-accent">
                  <Megaphone className="h-5 w-5" />
                </span>
                <div className="flex flex-col gap-0.5">
                  <h2 className="font-display text-base font-bold text-ink">This spot is open</h2>
                  <p className="text-xs text-muted">
                    Be the first featured sponsor — your product goes live here the moment you sponsor it.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
