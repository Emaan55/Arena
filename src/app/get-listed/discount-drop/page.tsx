"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Zap, Trophy, Share2, CheckCircle2 } from "lucide-react";
import { useAuthUser } from "@/lib/useAuthUser";
import type { ChallengeEvent } from "@/lib/discount-drop/schedule";

interface MissionProgress {
  votedDuels: number;
  required: number;
  complete: boolean;
}

interface Award {
  id: string;
  score: number;
  discount_percent: number;
  expires_at: string;
}

interface StatusResponse {
  canPlay: boolean;
  mission: MissionProgress | null;
  nextAttemptAt: string | null;
  cooldownActive: boolean;
  activeAward: Award | null;
}

interface LeaderboardRow {
  rank: number;
  player: string;
  score: number;
  discountPercent: number;
}

// "claim" = a still-active award is being shown with its live countdown;
// "no-discount" = the just-finished attempt scored too low for an award.
// Both are session-transient except "claim", which is also reconstructed
// from the server on every load (see loadStatus) so it survives a refresh.
type Phase = "loading" | "gate" | "ready" | "playing" | "claim" | "no-discount";

interface LiveEvent extends ChallengeEvent {
  spawnedAtClientMs: number;
}

interface Outcome {
  eventId: number;
  clicked: boolean;
  reactionMs: number | null;
}

function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export default function DiscountDropPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuthUser();
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [error, setError] = useState<string | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);

  // The one currently-claimable award (server-issued expires_at is the only
  // authority on when it expires — remainingMs below is purely a visual
  // countdown derived from it, ticked locally, never the source of truth).
  const [award, setAward] = useState<Award | null>(null);
  const [remainingMs, setRemainingMs] = useState<number | null>(null);
  // Session-only: true right after the local countdown hits zero and the
  // server confirms the award is really gone, so the gate screen can say
  // "your discount window has ended" instead of just going silent.
  const [expiredNotice, setExpiredNotice] = useState(false);
  const [noDiscountScore, setNoDiscountScore] = useState<number | null>(null);

  const [live, setLive] = useState<LiveEvent[]>([]);
  const [timeLeftMs, setTimeLeftMs] = useState(0);

  const attemptIdRef = useRef<string | null>(null);
  const scheduleRef = useRef<ChallengeEvent[]>([]);
  const outcomesRef = useRef<Map<number, Outcome>>(new Map());
  const gameStartRef = useRef(0);
  const durationRef = useRef(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // `drivePhase` only applies on the initial/refresh load and whenever we
  // need to re-sync after an award expires — refreshing attempt counts
  // right after a game ends must NOT flip the screen away from the result
  // the player just earned out from under them (see endGame).
  const loadStatus = useCallback(async (drivePhase: boolean = true) => {
    try {
      const res = await fetch("/api/get-listed/discount-drop/status");
      if (res.status === 401) return;
      const data: StatusResponse = await res.json();
      setStatus(data);
      if (!drivePhase) return;
      if (data.activeAward) {
        setAward(data.activeAward);
        setNoDiscountScore(null);
        setPhase("claim");
      } else {
        setAward(null);
        setPhase(data.canPlay ? "ready" : "gate");
      }
    } catch {
      setError("Could not load Discount Drop.");
    }
  }, []);

  useEffect(() => {
    if (authLoading || !user) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetching eligibility/active-award once auth resolves, not a render-driven derivation
    loadStatus();
  }, [authLoading, user, loadStatus]);

  useEffect(() => {
    fetch("/api/get-listed/discount-drop/leaderboard")
      .then((res) => res.json())
      .then((data) => setLeaderboard(data.leaderboard ?? []))
      .catch(() => {});
  }, []);

  // Drives the visible "Discount expires in 1:59" countdown purely from
  // award.expires_at (a server timestamp). When it reaches zero this
  // doesn't just assume expiry locally — it re-fetches /status so the
  // server's own clock is what actually confirms the award is gone,
  // correcting for any client clock drift either way.
  useEffect(() => {
    // Nothing to count down — stale remainingMs is harmless since the
    // "claim" screen that reads it only ever renders while award is set.
    if (!award) return;
    const expiresAtMs = new Date(award.expires_at).getTime();
    function tick() {
      const ms = expiresAtMs - Date.now();
      setRemainingMs(Math.max(0, ms));
      if (ms <= 0) {
        clearInterval(intervalId);
        setAward(null);
        setExpiredNotice(true);
        loadStatus(true);
      }
    }
    tick();
    const intervalId = setInterval(tick, 1000);
    return () => clearInterval(intervalId);
  }, [award, loadStatus]);

  const endGame = useCallback(async () => {
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = null;
    setLive([]);

    const outcomes = scheduleRef.current.map(
      (e) => outcomesRef.current.get(e.id) ?? { eventId: e.id, clicked: false, reactionMs: null },
    );
    const durationMs = Date.now() - gameStartRef.current;

    try {
      const res = await fetch("/api/get-listed/discount-drop/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attemptId: attemptIdRef.current, outcomes, durationMs }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not submit your result.");
        setPhase("ready");
        return;
      }
      setExpiredNotice(false);
      if (data.discountPercent > 0 && data.award) {
        setNoDiscountScore(null);
        setAward(data.award);
        setPhase("claim");
      } else {
        setAward(null);
        setNoDiscountScore(data.score);
        setPhase("no-discount");
      }
      // Refresh mission/cooldown state for later, without letting it
      // clobber the "claim"/"no-discount" screen we just set above.
      loadStatus(false);
      fetch("/api/get-listed/discount-drop/leaderboard")
        .then((r) => r.json())
        .then((d) => setLeaderboard(d.leaderboard ?? []))
        .catch(() => {});
    } catch {
      setError("Network error — please try again.");
      setPhase("ready");
    }
  }, [loadStatus]);

  function tick() {
    const elapsed = Date.now() - gameStartRef.current;
    const remaining = durationRef.current - elapsed;
    setTimeLeftMs(Math.max(0, remaining));

    const nowVisible: LiveEvent[] = [];
    for (const e of scheduleRef.current) {
      if (outcomesRef.current.has(e.id)) continue; // already resolved (clicked)
      if (elapsed < e.spawnAtMs) continue;
      if (elapsed >= e.spawnAtMs + e.ttlMs) {
        // expired without a click
        outcomesRef.current.set(e.id, { eventId: e.id, clicked: false, reactionMs: null });
        continue;
      }
      nowVisible.push({ ...e, spawnedAtClientMs: gameStartRef.current + e.spawnAtMs });
    }
    setLive(nowVisible);

    if (remaining <= 0) {
      endGame();
    }
  }

  async function startGame() {
    setError(null);
    try {
      const res = await fetch("/api/get-listed/discount-drop/start", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        if (data.error === "mission_incomplete" || data.error === "cooldown_active") {
          setStatus((s) => (s ? { ...s, mission: data.mission ?? s.mission, nextAttemptAt: data.nextAttemptAt ?? s.nextAttemptAt, cooldownActive: data.error === "cooldown_active", canPlay: false } : s));
          setPhase("gate");
          return;
        }
        if (res.status === 409) {
          // Server says an award is already active — resync to show it
          // instead of a generic error.
          loadStatus(true);
          return;
        }
        setError(data.error ?? "Could not start the game.");
        return;
      }
      setExpiredNotice(false);
      attemptIdRef.current = data.attemptId;
      scheduleRef.current = data.schedule;
      durationRef.current = data.durationMs;
      outcomesRef.current = new Map();
      gameStartRef.current = Date.now();
      setPhase("playing");
      tickRef.current = setInterval(tick, 50);
    } catch {
      setError("Network error — please try again.");
    }
  }

  function handleHit(event: LiveEvent) {
    if (outcomesRef.current.has(event.id)) return;
    // eslint-disable-next-line react-hooks/purity -- reading the click timestamp inside a click handler, never during render
    const reactionMs = Date.now() - event.spawnedAtClientMs;
    outcomesRef.current.set(event.id, { eventId: event.id, clicked: true, reactionMs });
    setLive((prev) => prev.filter((e) => e.id !== event.id));
  }

  function shareOnX(discountPercent: number) {
    const text = `I just unlocked ${discountPercent}% OFF on THE ARENA's Get Listed by playing Discount Drop! 🎯`;
    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent("https://www.thearena.lol/get-listed")}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  useEffect(() => {
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, []);

  if (!authLoading && !user) {
    return (
      <main className="mx-auto flex w-full max-w-xl flex-col items-center gap-4 px-6 py-24 text-center">
        <Zap className="h-8 w-8 text-accent" />
        <h1 className="font-display text-2xl font-bold text-ink">Sign in to play Discount Drop</h1>
        <Link
          href={`/auth/sign-in?next=${encodeURIComponent("/get-listed/discount-drop")}`}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink shadow-sm"
        >
          Sign in
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 py-16">
      <Link
        href="/get-listed"
        className="flex items-center gap-1.5 text-sm text-muted transition-colors duration-150 ease-out hover:text-accent"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Get Listed
      </Link>

      <div className="flex flex-col items-center gap-2 text-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
          <Zap className="h-3.5 w-3.5 text-accent" />
          Discount Drop
        </span>
        <h1 className="font-display text-3xl font-black uppercase text-ink">Hit the targets. Unlock a discount.</h1>
        <p className="max-w-md text-sm text-muted">
          45 seconds. Tap the cyan targets, avoid the red decoys. Speed and accuracy decide your discount — up to 60%
          off.
        </p>
      </div>

      {error && <p className="text-center text-sm text-danger">{error}</p>}

      {phase === "loading" && <p className="text-center text-sm text-muted">Loading…</p>}

      {phase === "gate" && status && (
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-border bg-surface p-8 text-center">
          {expiredNotice && (
            <div className="flex flex-col gap-1">
              <p className="font-display text-lg font-black uppercase text-ink">Discount expired</p>
              <p className="text-sm text-muted">Your discount window has ended.</p>
            </div>
          )}
          {status.mission && !status.mission.complete ? (
            <>
              <p className="text-sm text-ink">
                {expiredNotice ? "Complete the requirement to unlock another attempt." : `Vote on ${status.mission.required} different Arena duels to unlock another Discount Drop attempt.`}
              </p>
              <p className="text-sm text-muted">
                Progress: {status.mission.votedDuels} / {status.mission.required}
              </p>
              <Link
                href="/#duels"
                className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold uppercase tracking-wide text-accent-ink shadow-sm"
              >
                Vote on {status.mission.required} duels
              </Link>
            </>
          ) : (
            <>
              <p className="text-sm text-ink">You&apos;ve completed the requirement — come back soon for another attempt.</p>
              {status.nextAttemptAt && (
                <p className="text-sm text-muted">Next attempt unlocks {new Date(status.nextAttemptAt).toLocaleString()}</p>
              )}
            </>
          )}
        </div>
      )}

      {phase === "ready" && (
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-border bg-surface p-8 text-center">
          <button
            onClick={startGame}
            className="rounded-lg bg-accent px-8 py-3 text-base font-semibold uppercase tracking-wide text-accent-ink shadow-md transition-all duration-150 ease-out hover:-translate-y-0.5 hover:shadow-lg active:scale-95"
          >
            Start
          </button>
          <p className="text-xs text-muted">One attempt starts now — make it count.</p>
        </div>
      )}

      {phase === "playing" && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between text-sm font-semibold text-ink">
            <span>Time left: {(timeLeftMs / 1000).toFixed(1)}s</span>
            <span className="text-muted">Cyan = hit · Red = avoid</span>
          </div>
          <div className="relative h-[420px] w-full overflow-hidden rounded-2xl border border-border bg-bg">
            {live.map((event) => (
              <button
                key={event.id}
                onClick={() => handleHit(event)}
                aria-label={event.type === "target" ? "Target" : "Decoy — avoid"}
                className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full shadow-lg transition-transform active:scale-90 ${
                  event.type === "target" ? "bg-accent shadow-[0_0_20px_rgba(0,180,216,0.6)]" : "bg-danger shadow-[0_0_20px_rgba(255,59,48,0.5)]"
                }`}
                style={{
                  left: `${event.xPct}%`,
                  top: `${event.yPct}%`,
                  width: event.sizePx,
                  height: event.sizePx,
                }}
              />
            ))}
          </div>
        </div>
      )}

      {phase === "claim" && award && (
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-accent bg-accent-soft/10 p-8 text-center">
          <Trophy className="h-8 w-8 text-accent" />
          <h2 className="font-display text-2xl font-black uppercase text-ink">You unlocked {award.discount_percent}% off</h2>
          <p className="text-sm text-muted">Score: {award.score} / 100</p>
          <p className="text-sm text-ink">Use your discount before it expires.</p>
          <p className="font-display text-lg font-bold text-accent" aria-live="polite">
            Discount expires in {formatCountdown(remainingMs ?? 0)}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={() => router.push(`/get-listed?discountAward=${award.id}`)}
              className="flex items-center gap-2 rounded-lg bg-accent px-6 py-3 text-sm font-semibold uppercase tracking-wide text-accent-ink shadow-md"
            >
              <CheckCircle2 className="h-4 w-4" />
              Use My Discount
            </button>
            <button
              onClick={() => shareOnX(award.discount_percent)}
              className="flex items-center gap-2 rounded-lg border border-border bg-surface px-6 py-3 text-sm font-semibold text-ink shadow-sm"
            >
              <Share2 className="h-4 w-4" />
              Share on X
            </button>
          </div>
          <a href="#leaderboard" className="text-xs font-semibold text-accent hover:underline">
            View Leaderboard
          </a>
        </div>
      )}

      {phase === "no-discount" && noDiscountScore !== null && (
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-accent bg-accent-soft/10 p-8 text-center">
          <Trophy className="h-8 w-8 text-accent" />
          <h2 className="font-display text-2xl font-black uppercase text-ink">No discount this time</h2>
          <p className="text-sm text-muted">Score: {noDiscountScore} / 100</p>
          <a href="#leaderboard" className="text-xs font-semibold text-accent hover:underline">
            View Leaderboard
          </a>
        </div>
      )}

      <div id="leaderboard" className="flex flex-col gap-3 scroll-mt-20">
        <h2 className="flex items-center gap-2 font-display text-lg font-bold text-ink">
          <Trophy className="h-4 w-4 text-accent" />
          Discount Drop Leaderboard
        </h2>
        {leaderboard.length === 0 ? (
          <p className="text-sm text-muted">No verified runs yet — be the first.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface-2 text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-2">#</th>
                  <th className="px-4 py-2">Player</th>
                  <th className="px-4 py-2">Score</th>
                  <th className="px-4 py-2">Discount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-surface">
                {leaderboard.map((row) => (
                  <tr key={row.rank}>
                    <td className="px-4 py-2 text-muted">{row.rank}</td>
                    <td className="px-4 py-2 text-ink">{row.player}</td>
                    <td className="px-4 py-2 text-ink">{row.score}</td>
                    <td className="px-4 py-2 text-accent">{row.discountPercent}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
