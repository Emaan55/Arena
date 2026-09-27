import Link from "next/link";
import { Radar } from "lucide-react";
import type { MatchWithProducts } from "@/lib/arena-state";
import { ProductAvatar } from "./ProductAvatar";

type BattleStatus = "Leading" | "Trailing" | "Tied";

interface LiveBattleRow {
  productId: string;
  name: string;
  logoUrl: string | null;
  category: string;
  opponentName: string;
  votes: number;
  percentage: number;
  status: BattleStatus;
}

const STATUS_STYLE: Record<BattleStatus, string> = {
  Leading: "bg-accent-soft/15 text-accent",
  Trailing: "bg-surface-2 text-muted",
  Tied: "bg-surface-2 text-ink",
};

/**
 * Flattens each active match into two rows (one per side) and ranks every
 * currently-battling product by its own live vote count — pure derived
 * data from the same `matches` (status = active) the interactive duel
 * cards already use, no new query or tracking. Resolved duels never reach
 * this component since `ArenaState.matches` only ever holds active ones.
 */
function buildRows(matches: MatchWithProducts[]): LiveBattleRow[] {
  const rows: LiveBattleRow[] = [];

  for (const m of matches) {
    const total = m.votes_a + m.votes_b;
    const pctA = total > 0 ? Math.round((m.votes_a / total) * 100) : 50;

    rows.push({
      productId: m.product_a.id,
      name: m.product_a.name,
      logoUrl: m.product_a.logo_url,
      category: m.category,
      opponentName: m.product_b.name,
      votes: m.votes_a,
      percentage: pctA,
      status: m.votes_a === m.votes_b ? "Tied" : m.votes_a > m.votes_b ? "Leading" : "Trailing",
    });
    rows.push({
      productId: m.product_b.id,
      name: m.product_b.name,
      logoUrl: m.product_b.logo_url,
      category: m.category,
      opponentName: m.product_a.name,
      votes: m.votes_b,
      percentage: 100 - pctA,
      status: m.votes_b === m.votes_a ? "Tied" : m.votes_b > m.votes_a ? "Leading" : "Trailing",
    });
  }

  return rows.sort((a, b) => b.votes - a.votes);
}

export function LiveBattlesLeaderboard({ matches }: { matches: MatchWithProducts[] }) {
  const rows = buildRows(matches);

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-4 shadow-md sm:p-5">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-accent/20 bg-accent-soft/15 text-accent">
          <Radar className="h-5 w-5" />
        </span>
        <div className="flex flex-col">
          <h3 className="font-display text-base font-bold text-ink">Live Battles</h3>
          <span className="text-xs text-muted">Current ranking of active duels, by live vote count</span>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted">
          No active duels right now.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface-2 text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-3 py-2">#</th>
                <th className="px-3 py-2">Product</th>
                <th className="px-3 py-2">Category</th>
                <th className="px-3 py-2">Opponent</th>
                <th className="px-3 py-2 text-right">Votes</th>
                <th className="px-3 py-2 text-right">Share</th>
                <th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-surface">
              {rows.map((r, i) => (
                <tr key={r.productId}>
                  <td className="px-3 py-2 font-mono text-xs text-muted">{i + 1}</td>
                  <td className="px-3 py-2">
                    <Link href={`/product/${r.productId}`} className="flex min-w-0 items-center gap-2 hover:text-accent">
                      <ProductAvatar name={r.name} logoUrl={r.logoUrl} size="sm" />
                      <span className="truncate font-semibold text-ink">{r.name}</span>
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-xs text-muted">{r.category}</td>
                  <td className="px-3 py-2 text-xs text-muted">{r.opponentName}</td>
                  <td className="px-3 py-2 text-right font-mono text-ink">{r.votes}</td>
                  <td className="px-3 py-2 text-right font-mono text-xs text-muted">{r.percentage}%</td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[r.status]}`}>
                      {r.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
