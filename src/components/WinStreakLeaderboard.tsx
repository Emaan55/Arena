import Link from "next/link";
import { Flame, Trophy } from "lucide-react";
import type { Product } from "@/types/database";
import { ProductAvatar } from "./ProductAvatar";
import { CrownIcon } from "./icons";

/**
 * The fuller, dedicated "Win Streak" leaderboard — same source data as the
 * compact sidebar Leaderboard (state.topProducts: active/champion products
 * with wins > 0, ordered by wins desc), just presented as a complete
 * table with every column the spec calls for.
 *
 * "Current win streak" and "Total wins" show the same `wins` value on
 * purpose: this app has exactly one win counter, reset to 0 on any loss
 * or elimination (see lib/arena.ts) and never preserved anywhere else, so
 * there is no separate lifetime-wins figure to show without inventing one.
 * Both columns stay because the spec asks for both by name, but neither
 * is fabricated — they're the same real number, honestly labeled twice.
 */
export function WinStreakLeaderboard({ products }: { products: Product[] }) {
  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-4 shadow-md sm:p-5">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-accent/20 bg-accent-soft/15 text-accent">
          <Trophy className="h-5 w-5" />
        </span>
        <div className="flex flex-col">
          <h3 className="font-display text-base font-bold text-ink">Win Streak</h3>
          <span className="text-xs text-muted">Ranked by current unbroken win streak</span>
        </div>
      </div>

      {products.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted">
          No active win streaks yet, submit a product and start fighting.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface-2 text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-3 py-2">#</th>
                <th className="px-3 py-2">Product</th>
                <th className="px-3 py-2">Category</th>
                <th className="px-3 py-2 text-right">Win streak</th>
                <th className="px-3 py-2 text-right">Total wins</th>
                <th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-surface">
              {products.map((p, i) => (
                <tr key={p.id}>
                  <td className="px-3 py-2 font-mono text-xs text-muted">{i + 1}</td>
                  <td className="px-3 py-2">
                    <Link href={`/product/${p.id}`} className="flex min-w-0 items-center gap-2 hover:text-accent">
                      <ProductAvatar name={p.name} logoUrl={p.logo_url} size="sm" accent={p.status === "champion"} />
                      <span className="truncate font-semibold text-ink">{p.name}</span>
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-xs text-muted">{p.category}</td>
                  <td className="px-3 py-2 text-right">
                    <span className="inline-flex items-center gap-1 font-mono text-ink">
                      <Flame className="h-3.5 w-3.5 text-accent" fill="currentColor" />
                      {p.wins}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-ink">{p.wins}</td>
                  <td className="px-3 py-2">
                    {p.status === "champion" ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-accent-soft/15 px-2 py-0.5 text-xs font-semibold text-accent">
                        <CrownIcon className="h-3 w-3" />
                        Champion
                      </span>
                    ) : (
                      <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs font-semibold text-muted">
                        Active
                      </span>
                    )}
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
