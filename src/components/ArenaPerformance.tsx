import { Flame, Radar } from "lucide-react";
import type { Champion, Product } from "@/types/database";
import type { MatchWithProducts, ProductHistoryEntry } from "@/lib/arena-state";
import { CrownIcon } from "./icons";

/**
 * A compact summary of everything the Arena already knows about this
 * product's standing — pure display over existing data already fetched by
 * getProductDetail (product/currentMatch/champion/most-recent history
 * entry). No new query, no new tracking, no new table.
 */
export function ArenaPerformance({
  product,
  currentMatch,
  champion,
  mostRecentResult,
}: {
  product: Product;
  currentMatch: MatchWithProducts | null;
  champion: Champion | null;
  mostRecentResult: ProductHistoryEntry | null;
}) {
  const isSideA = currentMatch?.product_a_id === product.id;
  const ownVotes = currentMatch ? (isSideA ? currentMatch.votes_a : currentMatch.votes_b) : null;
  const opponentVotes = currentMatch ? (isSideA ? currentMatch.votes_b : currentMatch.votes_a) : null;
  const opponentName = currentMatch ? (isSideA ? currentMatch.product_b.name : currentMatch.product_a.name) : null;
  const total = ownVotes !== null && opponentVotes !== null ? ownVotes + opponentVotes : 0;
  const votePercentage = currentMatch && total > 0 ? Math.round(((ownVotes ?? 0) / total) * 100) : null;

  const duelStatus =
    product.status === "champion"
      ? "Reigning Champion"
      : product.status === "eliminated"
        ? "Eliminated"
        : currentMatch
          ? "Live Duel"
          : product.status === "unique"
            ? "Uncontested"
            : "Waiting for challenger";

  const duelResult = mostRecentResult
    ? `${mostRecentResult.won ? "Won vs" : "Lost to"} ${mostRecentResult.opponentName} (${mostRecentResult.scoreFor}-${mostRecentResult.scoreAgainst})`
    : "No completed duels yet";

  const stats: { label: string; value: string }[] = [
    { label: "Duel status", value: duelStatus },
    { label: "Current votes", value: currentMatch ? String(ownVotes) : "-" },
    { label: "Opponent", value: opponentName ?? "-" },
    { label: "Vote share", value: votePercentage !== null ? `${votePercentage}%` : "-" },
    { label: "Last duel result", value: duelResult },
    { label: "Win streak", value: String(product.wins) },
    { label: "Total wins", value: String(product.wins) },
    {
      label: "Champion status",
      value: product.status === "champion" ? "Champion" : champion ? "Former champion" : "Not yet",
    },
  ];

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <Radar className="h-4 w-4 text-accent" />
        <h2 className="font-display text-base font-bold text-ink">Arena Performance</h2>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((s) => (
          <div
            key={s.label}
            className={`rounded-lg bg-surface-2 p-3 ${s.label === "Last duel result" ? "col-span-2" : ""}`}
          >
            <span className="block text-[10px] font-semibold uppercase tracking-wide text-muted">{s.label}</span>
            <span
              className={`mt-0.5 flex items-center gap-1 text-sm font-bold text-ink ${
                s.label === "Last duel result" ? "" : "truncate"
              }`}
            >
              {s.label === "Win streak" && <Flame className="h-3.5 w-3.5 shrink-0 text-accent" fill="currentColor" />}
              {s.label === "Champion status" && product.status === "champion" && (
                <CrownIcon className="h-3.5 w-3.5 shrink-0 text-accent" />
              )}
              {s.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
