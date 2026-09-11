"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Search, X } from "lucide-react";
import type { ProductSearchResult } from "@/types/database";
import { ProductAvatar } from "./ProductAvatar";
import { XHandleLink } from "./XHandleLink";
import { STATUS_LABEL, STATUS_CLASS } from "@/lib/product-status";

const DEBOUNCE_MS = 300;
const MIN_QUERY_LEN = 2;

function useProductSearch(query: string) {
  const [results, setResults] = useState<ProductSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (q.length < MIN_QUERY_LEN) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResults([]);
      setLoading(false);
      setSearched(false);
      setErrored(false);
      return;
    }

    let active = true;
    setLoading(true);
    setErrored(false);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        if (!active) return;
        if (!res.ok) {
          setErrored(true);
          setResults([]);
          return;
        }
        setResults((data.results ?? []) as ProductSearchResult[]);
      } catch {
        if (active) {
          setErrored(true);
          setResults([]);
        }
      } finally {
        if (active) {
          setLoading(false);
          setSearched(true);
        }
      }
    }, DEBOUNCE_MS);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query]);

  return { results, loading, searched, errored };
}

function ResultRow({ result, onNavigate }: { result: ProductSearchResult; onNavigate: () => void }) {
  return (
    <li>
      <Link
        href={`/product/${result.id}`}
        onClick={onNavigate}
        className="flex items-start gap-3 px-4 py-3 transition-colors duration-150 ease-out hover:bg-surface-2"
      >
        <ProductAvatar name={result.name} size="sm" accent={result.status === "champion"} />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-semibold text-ink">{result.name}</span>
            <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${STATUS_CLASS[result.status]}`}>
              {STATUS_LABEL[result.status]}
            </span>
          </div>
          <span className="text-xs text-muted">{result.category}</span>
          <p className="line-clamp-1 text-xs text-muted">{result.battle_pitch || result.pitch}</p>
          <div className="flex items-center gap-2">
            {result.wins > 0 && (
              <span className="font-mono text-[10px] font-bold text-muted">
                🔥 {result.wins} win{result.wins === 1 ? "" : "s"}
              </span>
            )}
            <XHandleLink handle={result.x_handle} className="text-[11px] text-muted hover:text-accent" />
          </div>
        </div>
      </Link>
    </li>
  );
}

function SearchResultsPanel({
  query,
  onNavigate,
}: {
  query: string;
  onNavigate: () => void;
}) {
  const { results, loading, searched, errored } = useProductSearch(query);

  if (query.trim().length < MIN_QUERY_LEN) return null;

  return (
    <div className="absolute left-0 right-0 top-full z-50 mt-2 max-h-[60vh] overflow-y-auto rounded-xl border border-border bg-surface shadow-lg">
      {loading ? (
        <p className="px-4 py-6 text-center text-sm text-muted">Searching…</p>
      ) : errored ? (
        <p className="px-4 py-6 text-center text-sm text-muted">Search is unavailable right now.</p>
      ) : results.length === 0 && searched ? (
        <p className="px-4 py-6 text-center text-sm text-muted">
          No products match &ldquo;{query.trim()}&rdquo;.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {results.map((r) => (
            <ResultRow key={r.id} result={r} onNavigate={onNavigate} />
          ))}
        </ul>
      )}
    </div>
  );
}

/** Desktop: an always-visible search box inline in the header. */
export function ProductSearchBar({ className }: { className?: string }) {
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setFocused(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  return (
    <div ref={containerRef} className={`relative ${className ?? ""}`}>
      <div className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 transition-colors duration-150 ease-out focus-within:border-accent">
        <Search className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setQuery("");
              setFocused(false);
              (e.target as HTMLInputElement).blur();
            }
          }}
          placeholder="Search products…"
          aria-label="Search products"
          className="w-full bg-transparent text-sm text-ink placeholder:text-muted focus:outline-none"
        />
      </div>
      {focused && <SearchResultsPanel query={query} onNavigate={() => setFocused(false)} />}
    </div>
  );
}

/** Mobile: an icon button that opens a full-width search panel. */
export function ProductSearchToggle() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Search products"
        className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface text-ink transition-all duration-150 ease-out hover:border-accent active:scale-90"
      >
        <Search className="h-4 w-4" />
      </button>

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          // Portaled to <body> rather than rendered inline: the header is
          // `position: sticky` with a backdrop-blur, and a `filter`/
          // `backdrop-filter` ancestor becomes the containing block for a
          // `fixed` descendant in most browsers — so inset-0 here would
          // resolve against the ~60px header instead of the viewport.
          <div className="fixed inset-0 z-50 flex flex-col bg-bg">
            <div className="flex items-center gap-2 border-b border-border px-4 py-3">
              <Search className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setOpen(false);
                }}
                placeholder="Search products…"
                aria-label="Search products"
                className="w-full bg-transparent text-base text-ink placeholder:text-muted focus:outline-none"
              />
              <button
                onClick={() => {
                  setOpen(false);
                  setQuery("");
                }}
                aria-label="Close search"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted hover:text-ink"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <MobileSearchResults query={query} onNavigate={() => setOpen(false)} />
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

function MobileSearchResults({ query, onNavigate }: { query: string; onNavigate: () => void }) {
  const { results, loading, searched, errored } = useProductSearch(query);

  if (query.trim().length < MIN_QUERY_LEN) {
    return <p className="px-4 py-6 text-center text-sm text-muted">Type at least 2 characters to search.</p>;
  }
  if (loading) return <p className="px-4 py-6 text-center text-sm text-muted">Searching…</p>;
  if (errored) return <p className="px-4 py-6 text-center text-sm text-muted">Search is unavailable right now.</p>;
  if (results.length === 0 && searched) {
    return (
      <p className="px-4 py-6 text-center text-sm text-muted">No products match &ldquo;{query.trim()}&rdquo;.</p>
    );
  }
  return (
    <ul className="flex flex-col divide-y divide-border">
      {results.map((r) => (
        <ResultRow key={r.id} result={r} onNavigate={onNavigate} />
      ))}
    </ul>
  );
}
