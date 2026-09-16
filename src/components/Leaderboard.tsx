import Link from "next/link";
import type { Product } from "@/types/database";
import { ProductAvatar } from "./ProductAvatar";
import { CrownIcon } from "./icons";
import { Crown, Flame, Trophy } from "lucide-react";

const RANK_STYLES = [
  { gradient: "linear-gradient(135deg, #67e8f9, #0891b2)", crown: "text-accent" },
  { gradient: "linear-gradient(135deg, #f1f5f9, #94a3b8)", crown: "text-muted" },
  { gradient: "linear-gradient(135deg, #fbbf87, #b5651d)", crown: "text-[#b5651d]" },
];

function RankMedal({ rank }: { rank: number }) {
  const tier = RANK_STYLES[rank] ?? RANK_STYLES[2];
  return (
    <div className="relative flex h-9 w-9 shrink-0 items-center justify-center">
      <Crown
        className={`absolute -top-3 left-1/2 h-3.5 w-3.5 -translate-x-1/2 ${tier.crown}`}
        fill="currentColor"
        aria-hidden="true"
      />
      <span
        className="flex h-full w-full items-center justify-center rounded-full border border-black/10 font-mono text-sm font-bold text-black/70 shadow-sm"
        style={{ background: tier.gradient }}
      >
        {rank + 1}
      </span>
    </div>
  );
}

export function Leaderboard({ products }: { products: Product[] }) {
  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-4 shadow-md sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-accent/20 bg-accent-soft/15 text-accent">
            <Trophy className="h-5 w-5" />
          </span>
          <div className="flex flex-col">
            <h3 className="font-display text-base font-bold text-ink">Leaderboard</h3>
            <span className="text-xs text-muted">Consistency builds momentum</span>
          </div>
        </div>
        <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-surface-2 px-3 py-1.5 text-xs font-medium text-muted">
          <Flame className="h-3.5 w-3.5 text-accent" />
          By current win streak
        </span>
      </div>

      {products.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted">
          No active win streaks yet — submit a product and start fighting.
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {products.map((p, i) => (
            <li key={p.id}>
              <Link
                href={`/product/${p.id}`}
                className={`flex items-center gap-3 rounded-2xl border p-3 transition-all duration-150 ease-out hover:-translate-y-0.5 sm:p-4 ${
                  i === 0 ? "border-accent bg-accent-soft/5" : "border-border bg-surface hover:border-border-strong"
                }`}
                style={i === 0 ? { boxShadow: "var(--glow-accent)" } : undefined}
              >
                <RankMedal rank={i} />
                <ProductAvatar name={p.name} logoUrl={p.logo_url} accent={i === 0 || p.status === "champion"} />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="flex min-w-0 items-center gap-1.5 text-sm font-bold text-ink">
                    <span className="truncate">{p.name}</span>
                    {p.status === "champion" && (
                      <CrownIcon
                        className="h-3.5 w-3.5 shrink-0 text-accent"
                        style={{ animation: "crown-float 3s ease-in-out infinite" }}
                      />
                    )}
                  </span>
                  <span className="text-xs text-muted">{p.category}</span>
                </div>
                <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-accent-soft/15 px-3 py-1.5 font-mono text-sm font-bold text-accent">
                  <Flame className="h-3.5 w-3.5" fill="currentColor" />
                  {p.wins} {p.wins === 1 ? "win" : "wins"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
