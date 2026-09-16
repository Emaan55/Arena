"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, XCircle, ShieldCheck, Loader2 } from "lucide-react";

const SECRET_STORAGE_KEY = "arena_admin_secret"; // shared with /admin/sponsorships — one founder secret

interface Attempt {
  strategy: string;
  url: string;
  status: number | null;
  contentType: string | null;
  redirects: number;
  reason: string;
  retryable: boolean;
}

interface DiagnosticResult {
  url: string;
  status: "pending" | "success" | "temporary_failure" | "not_found";
  favicon: { sourceUrl: string; strategy: string; contentType: string; bytes: number } | null;
  attempts: Attempt[];
}

const STATUS_LABEL: Record<DiagnosticResult["status"], string> = {
  pending: "Pending",
  success: "Resolved",
  temporary_failure: "Temporary failure — will retry",
  not_found: "No favicon found — will retry",
};

/**
 * Founder-only tool for diagnosing why a given domain's favicon discovery
 * did or didn't succeed — runs the exact same discoverFavicon() pipeline
 * every product/sponsorship uses (see lib/favicon-service.ts) and shows
 * the full step-by-step trace, so a problematic domain can be diagnosed
 * in seconds instead of guessed at.
 */
export default function FaviconDiagnosticPage() {
  const [secret, setSecret] = useState<string | null>(null);
  const [secretInput, setSecretInput] = useState("");
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DiagnosticResult | null>(null);

  useEffect(() => {
    try {
      const saved = window.sessionStorage.getItem(SECRET_STORAGE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved) setSecret(saved);
    } catch {
      // sessionStorage unavailable — just fall back to the entry form.
    }
  }, []);

  function handleUnlock(e: React.FormEvent) {
    e.preventDefault();
    if (!secretInput.trim()) return;
    try {
      window.sessionStorage.setItem(SECRET_STORAGE_KEY, secretInput.trim());
    } catch {}
    setSecret(secretInput.trim());
  }

  async function runDiagnostic(e: React.FormEvent) {
    e.preventDefault();
    if (!secret || !url.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/admin/favicon-diagnostic", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-secret": secret },
        body: JSON.stringify({ url: url.trim() }),
      });
      const json = await res.json();
      if (res.status === 401) {
        setError("Wrong admin key.");
        setSecret(null);
        try {
          window.sessionStorage.removeItem(SECRET_STORAGE_KEY);
        } catch {}
        return;
      }
      if (!res.ok) {
        setError(json.error ?? "Diagnostic failed.");
        return;
      }
      setResult(json);
    } catch {
      setError("Network error — please try again.");
    } finally {
      setLoading(false);
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
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-12">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-bold text-ink">Favicon Diagnostic</h1>
        <p className="text-sm text-muted">
          Runs the real discovery pipeline against any URL and shows exactly which strategy
          succeeded or why every one failed — no guessing.
        </p>
      </div>

      <form onSubmit={runDiagnostic} className="flex gap-2">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.com"
          className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-accent focus:outline-none"
        />
        <button
          type="submit"
          disabled={loading || !url.trim()}
          className="flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink shadow-sm transition-all duration-150 ease-out hover:-translate-y-0.5 hover:shadow-md active:scale-95 disabled:pointer-events-none disabled:opacity-50"
        >
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          Run
        </button>
      </form>

      {error && <p className="text-sm text-danger">{error}</p>}

      {result && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2 rounded-xl border border-border bg-surface p-4 shadow-sm">
            {result.status === "success" ? (
              <CheckCircle2 className="h-5 w-5 shrink-0 text-accent" />
            ) : (
              <XCircle className="h-5 w-5 shrink-0 text-danger" />
            )}
            <div className="flex flex-col">
              <span className="text-sm font-bold text-ink">{STATUS_LABEL[result.status]}</span>
              {result.favicon && (
                <span className="break-all text-xs text-muted">
                  {result.favicon.strategy} · {result.favicon.contentType} · {result.favicon.bytes} bytes ·{" "}
                  {result.favicon.sourceUrl}
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-4 shadow-sm">
            <h2 className="text-sm font-bold text-ink">Step-by-step trace</h2>
            <ul className="flex flex-col divide-y divide-border">
              {result.attempts.map((a, i) => (
                <li key={i} className="flex items-start gap-2 py-2">
                  {a.reason === "success" ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                  ) : (
                    <XCircle className={`mt-0.5 h-4 w-4 shrink-0 ${a.retryable ? "text-muted" : "text-danger"}`} />
                  )}
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-xs font-semibold text-ink">{a.strategy}</span>
                    <span className="break-all text-xs text-muted">{a.url}</span>
                    <span className="text-xs text-muted">
                      status={a.status ?? "—"} · type={a.contentType ?? "—"} · redirects={a.redirects} · {a.reason}
                      {a.retryable ? " (retryable)" : ""}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </main>
  );
}
