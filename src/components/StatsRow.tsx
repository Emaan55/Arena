import { Package, Swords, TrendingUp, Radar } from "lucide-react";
import type { HomeStats } from "@/lib/arena-state";

export function StatsRow({ stats }: { stats: HomeStats }) {
  const items = [
    { icon: Package, value: stats.productsSubmitted, label: "Products Submitted" },
    { icon: Swords, value: stats.duelsFought, label: "Duels Fought" },
    { icon: TrendingUp, value: stats.totalVotes, label: "Total Votes" },
    { icon: Radar, value: stats.arenaExposure, label: "Arena Exposure" },
  ];

  return (
    <div className="grid w-full max-w-3xl grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-4">
      {items.map(({ icon: Icon, value, label }) => (
        <div key={label} className="flex flex-col items-center gap-1 bg-surface px-3 py-3 text-center">
          <Icon className="h-4 w-4 text-accent" aria-hidden="true" />
          <span className="font-mono text-xl font-bold text-ink">{value.toLocaleString()}</span>
          <span className="text-xs text-muted">{label}</span>
        </div>
      ))}
    </div>
  );
}
