"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Clear stale remote results when the query becomes too short.
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
        const response = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
        const data = await response.json();
        if (!active) return;
        if (!response.ok) {
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

function ResultRow({
  result,
  active,
  optionId,
  onNavigate,
  onHover,
}: {
  result: ProductSearchResult;
  active: boolean;
  optionId: string;
  onNavigate: () => void;
  onHover: () => void;
}) {
  return (
    <li id={optionId} role="option" aria-selected={active}>
      <Link
        href={`/product/${result.id}`}
        onClick={onNavigate}
        onMouseEnter={onHover}
        className={`flex items-start gap-3 px-4 py-3 transition-colors ${active ? "bg-accent/10" : "hover:bg-surface-2"}`}
      >
        <ProductAvatar name={result.name} logoUrl={result.logo_url} size="sm" accent={result.status === "champion"} />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex min-w-0 items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{result.name}</span>
            <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${STATUS_CLASS[result.status]}`}>
              {STATUS_LABEL[result.status]}
            </span>
          </div>
          <span className="truncate text-xs text-muted">{result.category}</span>
          <p className="line-clamp-1 text-xs text-muted">{result.battle_pitch || result.pitch}</p>
          <div className="flex items-center gap-2">
            {result.wins > 0 && <span className="font-mono text-[10px] font-bold text-muted">🔥 {result.wins} win{result.wins === 1 ? "" : "s"}</span>}
            <XHandleLink handle={result.x_handle} className="text-[11px] text-muted hover:text-accent" />
          </div>
        </div>
      </Link>
    </li>
  );
}

function SearchResultsPanel({
  query,
  results,
  loading,
  searched,
  errored,
  selectedIndex,
  onSelect,
  onNavigate,
}: ReturnType<typeof useProductSearch> & {
  query: string;
  selectedIndex: number;
  onSelect: (index: number) => void;
  onNavigate: () => void;
}) {
  if (query.trim().length < MIN_QUERY_LEN) return null;

  return (
    <div className="absolute right-0 top-full z-[70] mt-2 max-h-[60vh] w-full min-w-[320px] overflow-y-auto rounded-2xl border border-border bg-bg shadow-lg" role="region" aria-label="Product search results">
      {loading ? (
        <p className="px-4 py-7 text-center text-sm text-muted">Searching…</p>
      ) : errored ? (
        <p className="px-4 py-7 text-center text-sm text-muted">Search is unavailable right now.</p>
      ) : results.length === 0 && searched ? (
        <p className="px-4 py-7 text-center text-sm text-muted">No products match &ldquo;{query.trim()}&rdquo;.</p>
      ) : (
        <ul id="desktop-product-search-results" role="listbox" className="flex flex-col divide-y divide-border">
          {results.map((result, index) => (
            <ResultRow
              key={result.id}
              result={result}
              active={selectedIndex === index}
              optionId={`desktop-product-search-option-${index}`}
              onHover={() => onSelect(index)}
              onNavigate={onNavigate}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

/** Desktop/tablet: compact search that expands while active. */
export function ProductSearchBar({ className }: { className?: string }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const search = useProductSearch(query);

  useEffect(() => {
    function onClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setFocused(false);
        setSelectedIndex(-1);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function close() {
    setFocused(false);
    setSelectedIndex(-1);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      setQuery("");
      close();
      event.currentTarget.blur();
      return;
    }
    if (!search.results.length) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSelectedIndex((index) => (index + 1) % search.results.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setSelectedIndex((index) => (index <= 0 ? search.results.length - 1 : index - 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const result = search.results[selectedIndex >= 0 ? selectedIndex : 0];
      if (result) {
        close();
        router.push(`/product/${result.id}`);
      }
    }
  }

  return (
    <div
      ref={containerRef}
      className={`relative shrink-0 transition-[width] duration-200 ease-out ${focused ? "w-[min(340px,34vw)]" : "w-[210px]"} ${className ?? ""}`}
    >
      <div className="flex h-10 items-center gap-2 rounded-xl border border-border bg-surface px-3 transition-all focus-within:border-accent focus-within:shadow-[0_0_0_3px_rgba(0,180,216,0.1)]">
        <Search className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
        <input
          value={query}
          onChange={(event) => { setQuery(event.target.value); setSelectedIndex(-1); }}
          onFocus={() => setFocused(true)}
          onKeyDown={onKeyDown}
          placeholder="Search products…"
          aria-label="Search products"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={focused && query.trim().length >= MIN_QUERY_LEN}
          aria-controls="desktop-product-search-results"
          aria-activedescendant={selectedIndex >= 0 ? `desktop-product-search-option-${selectedIndex}` : undefined}
          className="min-w-0 w-full bg-transparent text-sm text-ink placeholder:text-muted focus:outline-none"
        />
        {query && <button type="button" onClick={() => { setQuery(""); setSelectedIndex(-1); }} aria-label="Clear search" className="text-muted hover:text-ink"><X className="h-3.5 w-3.5" /></button>}
      </div>
      {focused && <SearchResultsPanel query={query} {...search} selectedIndex={selectedIndex} onSelect={setSelectedIndex} onNavigate={close} />}
    </div>
  );
}

/** Mobile: an icon button that opens a full-width search panel. */
export function ProductSearchToggle() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const search = useProductSearch(query);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  function close() {
    setOpen(false);
    setQuery("");
    setSelectedIndex(-1);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") return close();
    if (!search.results.length) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSelectedIndex((index) => (index + 1) % search.results.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setSelectedIndex((index) => (index <= 0 ? search.results.length - 1 : index - 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const result = search.results[selectedIndex >= 0 ? selectedIndex : 0];
      if (result) {
        close();
        router.push(`/product/${result.id}`);
      }
    }
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label="Search products" className="flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-ink">
        <Search className="h-4 w-4" />
      </button>
      {open && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[100] flex flex-col bg-bg">
          <div className="flex items-center gap-3 border-b border-border px-4 py-3">
            <Search className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
            <input
              ref={inputRef}
              value={query}
              onChange={(event) => { setQuery(event.target.value); setSelectedIndex(-1); }}
              onKeyDown={onKeyDown}
              placeholder="Search products…"
              aria-label="Search products"
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={query.trim().length >= MIN_QUERY_LEN}
              aria-controls="mobile-product-search-results"
              aria-activedescendant={selectedIndex >= 0 ? `mobile-product-search-option-${selectedIndex}` : undefined}
              className="w-full bg-transparent text-base text-ink placeholder:text-muted focus:outline-none"
            />
            <button type="button" onClick={close} aria-label="Close search" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-ink"><X className="h-4 w-4" /></button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {query.trim().length < MIN_QUERY_LEN ? <p className="px-4 py-8 text-center text-sm text-muted">Type at least 2 characters to search.</p> : search.loading ? <p className="px-4 py-8 text-center text-sm text-muted">Searching…</p> : search.errored ? <p className="px-4 py-8 text-center text-sm text-muted">Search is unavailable right now.</p> : search.results.length === 0 && search.searched ? <p className="px-4 py-8 text-center text-sm text-muted">No products match &ldquo;{query.trim()}&rdquo;.</p> : (
              <ul id="mobile-product-search-results" role="listbox" className="flex flex-col divide-y divide-border">
                {search.results.map((result, index) => <ResultRow key={result.id} result={result} active={selectedIndex === index} optionId={`mobile-product-search-option-${index}`} onHover={() => setSelectedIndex(index)} onNavigate={close} />)}
              </ul>
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

