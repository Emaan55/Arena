"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronUp, Loader2, ShieldCheck, X } from "lucide-react";
import type { Sponsorship, ProductSearchResult, Category } from "@/types/database";
import { CATEGORIES } from "@/types/database";
import {
  SPONSOR_DURATIONS,
  SPONSOR_PRICE_LABELS,
  resolveSponsorshipDisplay,
  type SponsorDuration,
} from "@/lib/sponsorship-constants";
import { ProductAvatar } from "@/components/ProductAvatar";

// Matches the sponsor-context chrome the old bespoke SponsorLogo component
// used (thicker accent border, larger radius) — ProductAvatar is now the
// single shared favicon/fallback implementation everywhere.
const SPONSOR_LOGO_BASE =
  "flex shrink-0 items-center justify-center overflow-hidden rounded-2xl border-2 border-accent bg-surface-2";
import { XHandleLink } from "@/components/XHandleLink";

const SECRET_STORAGE_KEY = "arena_admin_secret";
const NAME_MAX = 80;
const DESCRIPTION_MAX = 140;

type AdminProduct = { name: string; url: string; category: string; pitch: string } | null;
type SponsorshipWithProduct = Sponsorship & { product: AdminProduct };

interface AdminData {
  active: SponsorshipWithProduct | null;
  queue: SponsorshipWithProduct[];
  history: SponsorshipWithProduct[];
}

function formatDate(iso: string | null) {
  if (!iso) return "-";
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

/** Founder-only auto-detect for the external-product form below — same
 * public, rate-limited endpoint the Sponsored section itself uses. */
function useUrlDetect(url: string, nameTouched: boolean, onDetected: (name: string | null, logoUrl: string | null) => void) {
  const [detecting, setDetecting] = useState(false);

  useEffect(() => {
    if (!url.includes(".")) return;
    const t = setTimeout(async () => {
      setDetecting(true);
      try {
        const res = await fetch("/api/sponsorship/resolve-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url }),
        });
        const data = await res.json();
        if (res.ok) onDetected(nameTouched ? null : data.name, data.logoUrl ?? null);
      } catch {
        // best-effort only
      } finally {
        setDetecting(false);
      }
    }, 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  return detecting;
}

function DurationPicker({
  duration,
  onChange,
}: {
  duration: SponsorDuration;
  onChange: (days: SponsorDuration) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {SPONSOR_DURATIONS.map((days) => (
        <button
          key={days}
          onClick={() => onChange(days)}
          className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all duration-150 ease-out active:scale-95 ${
            duration === days ? "border-accent bg-accent text-accent-ink" : "border-border text-muted hover:text-ink"
          }`}
        >
          {days}d ({SPONSOR_PRICE_LABELS[days]} value)
        </button>
      ))}
    </div>
  );
}

/**
 * Founder-only control panel for the Sponsored section — no account system
 * exists anywhere else in the app, so this is gated by a single shared
 * secret (ADMIN_SECRET, see lib/admin-auth.ts) entered once and kept in
 * sessionStorage, sent as `x-admin-secret` on every request below. This is
 * the ONLY place a free sponsorship can ever be created — the public
 * Sponsored section always goes through paid checkout.
 */
export default function AdminSponsorshipsPage() {
  const [secret, setSecret] = useState<string | null>(null);
  const [secretInput, setSecretInput] = useState("");
  const [data, setData] = useState<AdminData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [mode, setMode] = useState<"arena" | "external">("arena");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProductSearchResult[]>([]);
  const [pickedProductId, setPickedProductId] = useState<string | null>(null);
  const [pickedProductName, setPickedProductName] = useState<string>("");
  const [duration, setDuration] = useState<SponsorDuration>(7);

  const [extUrl, setExtUrl] = useState("");
  const [extName, setExtName] = useState("");
  const [extNameTouched, setExtNameTouched] = useState(false);
  const [extCategory, setExtCategory] = useState<Category>("General");
  const [extDescription, setExtDescription] = useState("");
  const [extLogoUrl, setExtLogoUrl] = useState<string | null>(null);
  const [extFounderName, setExtFounderName] = useState("");
  const [founderXHandle, setFounderXHandle] = useState("");
  const detecting = useUrlDetect(extUrl, extNameTouched, (name, logoUrl) => {
    if (name) setExtName(name);
    setExtLogoUrl(logoUrl);
  });

  useEffect(() => {
    try {
      const saved = window.sessionStorage.getItem(SECRET_STORAGE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved) setSecret(saved);
    } catch {
      // sessionStorage unavailable — just fall back to the entry form.
    }
  }, []);

  const load = useCallback(async (key: string) => {
    setError(null);
    try {
      const res = await fetch("/api/admin/sponsorships", { headers: { "x-admin-secret": key } });
      if (res.status === 401) {
        setError("Wrong admin key.");
        setSecret(null);
        try {
          window.sessionStorage.removeItem(SECRET_STORAGE_KEY);
        } catch {}
        return;
      }
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Could not load sponsorships.");
        return;
      }
      setData(json);
    } catch {
      setError("Network error, please try again.");
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (secret) load(secret);
  }, [secret, load]);

  useEffect(() => {
    if (!query.trim()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        const json = await res.json();
        setResults(json.results ?? []);
      } catch {
        setResults([]);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  function handleUnlock(e: React.FormEvent) {
    e.preventDefault();
    if (!secretInput.trim()) return;
    try {
      window.sessionStorage.setItem(SECRET_STORAGE_KEY, secretInput.trim());
    } catch {}
    setSecret(secretInput.trim());
  }

  const externalReady =
    extName.trim().length > 0 &&
    extName.trim().length <= NAME_MAX &&
    extUrl.trim().length > 0 &&
    extDescription.trim().length > 0 &&
    extDescription.trim().length <= DESCRIPTION_MAX;

  async function addSponsor() {
    if (!secret) return;
    if (mode === "arena" && !pickedProductId) return;
    if (mode === "external" && !externalReady) return;

    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/sponsorships", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-secret": secret },
        body: JSON.stringify(
          mode === "arena"
            ? { productId: pickedProductId, durationDays: duration, founderXHandle: founderXHandle.trim() }
            : {
                durationDays: duration,
                founderXHandle: founderXHandle.trim(),
                founderName: extFounderName.trim(),
                external: {
                  name: extName.trim(),
                  url: extUrl.trim(),
                  category: extCategory,
                  description: extDescription.trim(),
                },
              },
        ),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Could not add sponsor.");
        return;
      }
      setPickedProductId(null);
      setPickedProductName("");
      setQuery("");
      setExtUrl("");
      setExtName("");
      setExtNameTouched(false);
      setExtDescription("");
      setExtLogoUrl(null);
      setExtFounderName("");
      setFounderXHandle("");
      await load(secret);
    } finally {
      setBusy(false);
    }
  }

  async function cancel(id: string) {
    if (!secret) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/sponsorships?id=${id}`, {
        method: "DELETE",
        headers: { "x-admin-secret": secret },
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Could not cancel.");
        return;
      }
      await load(secret);
    } finally {
      setBusy(false);
    }
  }

  async function move(id: string, direction: -1 | 1) {
    if (!secret || !data) return;
    const ids = data.queue.map((s) => s.id);
    const i = ids.indexOf(id);
    const j = i + direction;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    setBusy(true);
    try {
      const res = await fetch("/api/admin/sponsorships", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-admin-secret": secret },
        body: JSON.stringify({ orderedIds: ids }),
      });
      if (res.ok) await load(secret);
    } finally {
      setBusy(false);
    }
  }

  if (!secret) {
    return (
      <main className="flex min-h-[70vh] items-center justify-center px-6">
        <form
          onSubmit={handleUnlock}
          className="flex w-full max-w-sm flex-col gap-3 rounded-2xl border border-border bg-surface p-6 shadow-md"
        >
          <div className="flex items-center gap-2 text-ink">
            <ShieldCheck className="h-5 w-5 text-accent" />
            <span className="font-display text-base font-bold">Admin</span>
          </div>
          <input
            type="password"
            value={secretInput}
            onChange={(e) => setSecretInput(e.target.value)}
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

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-12">
      <h1 className="font-display text-2xl font-bold text-ink">Sponsorship Admin</h1>
      {error && <p className="text-sm text-danger">{error}</p>}

      <section className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5 shadow-sm">
        <h2 className="font-display text-sm font-bold text-ink">Active sponsor</h2>
        {data?.active && resolveSponsorshipDisplay(data.active) ? (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-accent bg-accent-soft/5 p-4">
            <div className="flex items-center gap-3">
              <ProductAvatar
                logoUrl={resolveSponsorshipDisplay(data.active)!.logoUrl}
                name={resolveSponsorshipDisplay(data.active)!.name}
                glow
                padded
                className={`h-10 w-10 ${SPONSOR_LOGO_BASE}`}
              />
              <div className="flex flex-col gap-0.5">
                <span className="font-semibold text-ink">{resolveSponsorshipDisplay(data.active)!.name}</span>
                <span className="text-xs text-muted">
                  {resolveSponsorshipDisplay(data.active)!.category}
                  {data.active.is_external ? " · External" : ""}
                </span>
                <span className="text-xs text-muted">
                  {formatDate(data.active.starts_at)} → {formatDate(data.active.ends_at)}
                  {data.active.is_free ? " · Free" : ""}
                </span>
                {resolveSponsorshipDisplay(data.active)!.founderName && (
                  <span className="text-xs text-muted">By {resolveSponsorshipDisplay(data.active)!.founderName}</span>
                )}
                <XHandleLink handle={resolveSponsorshipDisplay(data.active)!.xHandle} />
              </div>
            </div>
            <button
              onClick={() => cancel(data.active!.id)}
              disabled={busy}
              className="flex items-center gap-1 rounded-lg border border-danger px-3 py-1.5 text-xs font-semibold text-danger transition-all duration-150 ease-out hover:bg-danger hover:text-danger-ink active:scale-95 disabled:opacity-50"
            >
              <X className="h-3.5 w-3.5" />
              Cancel
            </button>
          </div>
        ) : (
          <p className="text-sm text-muted">No active sponsor. The next queued product will be promoted automatically.</p>
        )}
      </section>

      <section className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5 shadow-sm">
        <h2 className="font-display text-sm font-bold text-ink">Queue ({data?.queue.length ?? 0})</h2>
        {!data || data.queue.length === 0 ? (
          <p className="text-sm text-muted">Nothing queued.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {data.queue.map((s, i) => {
              const display = resolveSponsorshipDisplay(s);
              return (
                <li
                  key={s.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface-2 p-3"
                >
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-semibold text-ink">{display?.name ?? "Unknown"}</span>
                    <span className="text-xs text-muted">
                      {s.duration_days} days{s.is_free ? " · Free" : ""}
                      {s.is_external ? " · External" : ""}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => move(s.id, -1)}
                      disabled={busy || i === 0}
                      aria-label="Move up"
                      className="flex h-7 w-7 items-center justify-center rounded-lg border border-border text-muted transition-colors duration-150 hover:text-ink disabled:opacity-30"
                    >
                      <ChevronUp className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => move(s.id, 1)}
                      disabled={busy || i === data.queue.length - 1}
                      aria-label="Move down"
                      className="flex h-7 w-7 items-center justify-center rounded-lg border border-border text-muted transition-colors duration-150 hover:text-ink disabled:opacity-30"
                    >
                      <ChevronDown className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => cancel(s.id)}
                      disabled={busy}
                      aria-label="Remove"
                      className="flex h-7 w-7 items-center justify-center rounded-lg border border-danger/40 text-danger transition-colors duration-150 hover:bg-danger hover:text-danger-ink"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5 shadow-sm">
        <h2 className="font-display text-sm font-bold text-ink">Add a sponsor (free, founder only)</h2>

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
          <>
            <div className="relative flex flex-col gap-2">
              <input
                value={pickedProductId ? pickedProductName : query}
                onChange={(e) => {
                  setPickedProductId(null);
                  setQuery(e.target.value);
                }}
                placeholder="Search products by name…"
                className="rounded-lg border border-border bg-bg px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-accent focus:outline-none"
              />
              {!pickedProductId && results.length > 0 && (
                <ul className="flex flex-col gap-1 rounded-lg border border-border bg-surface-2 p-1">
                  {results.map((r) => (
                    <li key={r.id}>
                      <button
                        onClick={() => {
                          setPickedProductId(r.id);
                          setPickedProductName(r.name);
                          setResults([]);
                        }}
                        className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm text-ink hover:bg-surface"
                      >
                        <span>{r.name}</span>
                        <span className="text-xs text-muted">{r.category}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <input
              value={founderXHandle}
              onChange={(e) => setFounderXHandle(e.target.value)}
              placeholder="@yourhandle (founder X handle, optional)"
              className="rounded-lg border border-border bg-bg px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-accent focus:outline-none"
            />

            <DurationPicker duration={duration} onChange={setDuration} />

            <button
              onClick={addSponsor}
              disabled={busy || !pickedProductId}
              className="w-fit rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink shadow-sm transition-all duration-150 ease-out hover:-translate-y-0.5 hover:shadow-md active:scale-95 disabled:pointer-events-none disabled:opacity-50"
            >
              Confirm Sponsorship
            </button>
          </>
        ) : (
          <>
            <div className="flex flex-col gap-2">
              <input
                value={extUrl}
                onChange={(e) => setExtUrl(e.target.value)}
                placeholder="https://theirproduct.com"
                className="rounded-lg border border-border bg-bg px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-accent focus:outline-none"
              />
              <div className="flex items-center gap-2">
                {detecting ? (
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-2">
                    <Loader2 className="h-4 w-4 animate-spin text-muted" />
                  </span>
                ) : (
                  <ProductAvatar logoUrl={extLogoUrl} name={extName || "?"} glow padded className={`h-9 w-9 ${SPONSOR_LOGO_BASE}`} />
                )}
                <input
                  value={extName}
                  onChange={(e) => {
                    setExtNameTouched(true);
                    setExtName(e.target.value);
                  }}
                  placeholder="Product name"
                  maxLength={NAME_MAX}
                  className="flex-1 rounded-lg border border-border bg-bg px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-accent focus:outline-none"
                />
              </div>
              <select
                value={extCategory}
                onChange={(e) => setExtCategory(e.target.value as Category)}
                className="rounded-lg border border-border bg-bg px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <input
                value={extDescription}
                onChange={(e) => setExtDescription(e.target.value)}
                placeholder="Short description"
                maxLength={DESCRIPTION_MAX}
                className="rounded-lg border border-border bg-bg px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-accent focus:outline-none"
              />
              <input
                value={extFounderName}
                onChange={(e) => setExtFounderName(e.target.value)}
                placeholder="Founder name"
                maxLength={NAME_MAX}
                className="rounded-lg border border-border bg-bg px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-accent focus:outline-none"
              />
              <input
                value={founderXHandle}
                onChange={(e) => setFounderXHandle(e.target.value)}
                placeholder="@yourhandle (founder X handle, optional)"
                className="rounded-lg border border-border bg-bg px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-accent focus:outline-none"
              />
            </div>

            {/* Review/preview — only once there's enough to actually show,
                followed by duration and the confirm step. */}
            {externalReady && (
              <>
                <div className="flex items-center gap-3 rounded-xl border border-accent bg-accent-soft/5 p-3">
                  <ProductAvatar logoUrl={extLogoUrl} name={extName} glow padded className={`h-10 w-10 ${SPONSOR_LOGO_BASE}`} />
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate text-sm font-semibold text-ink">{extName}</span>
                    <span className="text-xs text-muted">{extCategory} · External</span>
                    <span className="truncate text-xs text-muted">{extDescription}</span>
                    {(extFounderName.trim() || founderXHandle.trim()) && (
                      <span className="text-xs text-muted">
                        {extFounderName.trim()}
                        {extFounderName.trim() && founderXHandle.trim() ? " · " : ""}
                        {founderXHandle.trim() && `@${founderXHandle.trim().replace(/^@/, "")}`}
                      </span>
                    )}
                  </div>
                </div>

                <DurationPicker duration={duration} onChange={setDuration} />

                <button
                  onClick={addSponsor}
                  disabled={busy}
                  className="w-fit rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink shadow-sm transition-all duration-150 ease-out hover:-translate-y-0.5 hover:shadow-md active:scale-95 disabled:pointer-events-none disabled:opacity-50"
                >
                  Confirm Sponsorship
                </button>
              </>
            )}
          </>
        )}
      </section>

      <section className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5 shadow-sm">
        <h2 className="font-display text-sm font-bold text-ink">History</h2>
        {!data || data.history.length === 0 ? (
          <p className="text-sm text-muted">Nothing yet.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {data.history.map((s) => {
              const display = resolveSponsorshipDisplay(s);
              return (
                <li key={s.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <div className="flex flex-col">
                    <span className="text-ink">{display?.name ?? "Unknown"}</span>
                    <span className="text-xs text-muted">
                      {formatDate(s.starts_at)} → {formatDate(s.ends_at)}
                    </span>
                  </div>
                  <span className={`text-xs font-semibold ${s.status === "cancelled" ? "text-danger" : "text-muted"}`}>
                    {s.status}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
