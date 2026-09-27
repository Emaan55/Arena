import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { getArenaState } from "@/lib/arena-state";
import { LiveBattlesLeaderboard } from "@/components/LiveBattlesLeaderboard";

export const dynamic = "force-dynamic";

/**
 * Dedicated public page for the Live Battles ranking (previously a
 * homepage section) — reuses getArenaState/LiveBattlesLeaderboard as-is,
 * so this is purely a new place to view the exact same active-duel data,
 * not a new data source or ranking rule.
 */
export default async function LiveBattlesPage() {
  const admin = createAdminSupabaseClient();
  const state = await getArenaState(admin);

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-16">
      <Link
        href="/"
        className="flex items-center gap-1.5 text-sm text-muted transition-colors duration-150 ease-out hover:text-accent"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to the Arena
      </Link>

      <div className="flex flex-col gap-2">
        <h1 className="font-display text-3xl font-black uppercase tracking-tight text-ink sm:text-4xl">
          Live Battles
        </h1>
        <p className="text-sm text-muted sm:text-base">
          Every product currently in an active duel, ranked by its live vote count. This is the current
          position in each battle, not a &quot;best products&quot; ranking.
        </p>
      </div>

      <LiveBattlesLeaderboard matches={state.matches} />
    </main>
  );
}
