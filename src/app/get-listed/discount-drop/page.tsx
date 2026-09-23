"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Zap, Trophy, Share2, CheckCircle2 } from "lucide-react";
import { useAuthUser } from "@/lib/useAuthUser";
import type { ChallengeEvent } from "@/lib/discount-drop/schedule";

interface StatusResponse {
  attemptsUsed: number;
  maxAttempts: number;
  canPlay: boolean;
  mission: { votedDuels: number; required: number; complete: boolean } | null;
  activeAward: { id: string; discount_percent: number; expires_at: string } | null;
}

interface LeaderboardRow {
  rank: number;
  player: string;
  score: number;
  discountPercent: number;
}

type Phase = "loading" | "gate" | "ready" | "playing" | "result";

interface LiveEvent extends ChallengeEvent {
  spawnedAtClientMs: number;
}

interface Outcome {
  eventId: number;
  clicked: boolean;
  reactionMs: number | null;
}

export default function DiscountDropPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuthUser();
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [error, setError] = useState<string | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);
  const [result, setResult] = useState<{ score: number; discountPercent: number; award: { id: string } | null } | null>(
    null,
  );

  const [live, setLive] = useState<LiveEvent[]>([]);
  const [timeLeftMs, setTimeLeftMs] = useState(0);

  const attemptIdRef = useRef<string | null>(null);
  const scheduleRef = useRef<ChallengeEvent[]>([]);
  const outcomesRef = useRef<Map<number, Outcome>>(new Map());
  const gameStartRef = useRef(0);
  const durationRef = useRef(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // `drivePhase` only applies on the initial load (before a game has been
  // played) — refreshing attempt counts after a game ends must NOT flip
  // the screen away from the result the player just earned back to
  // "ready"/"gate" out from under them.
  const loadStatus = useCallback(async (drivePhase: boolean = true) => {
    try {
      const res = await fetch("/api/get-listed/discount-drop/status");
      if (res.status === 401) return;
      const data = await res.json();
      setStatus(data);
      if (drivePhase) setPhase(data.canPlay ? "ready" : "gate");
    } catch {
      setError("Could not load Discount Drop.");
    }
  }, []);

  useEffect(() => {
    if (authLoading || !user) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetching eligibility once auth resolves, not a render-driven derivation
    loadStatus();
  }, [authLoading, user, loadStatus]);

  useEffect(() => {
    fetch("/api/get-listed/discount-drop/leaderboard")
      .then((res) => res.json())
      .then((data) => setLeaderboard(data.leaderboard ?? []))
      .catch(() => {});
  }, []);

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
      setResult(data);
      setPhase("result");
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
        if (data.error === "mission_incomplete") {
          setStatus((s) => (s ? { ...s, mission: data.mission, canPlay: false } : s));
          setPhase("gate");
          return;
        }
        setError(data.error ?? "Could not start the game.");
        return;
      }
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
          {status.attemptsUsed >= status.maxAttempts ? (
            <>
              <p className="text-sm text-ink">You&apos;ve used both of your attempts.</p>
              <p className="text-sm text-muted">Your best verified result still counts — check the leaderboard below.</p>
            </>
          ) : (
            <>
              <p className="text-sm text-ink">Vote on {status.mission?.required ?? 3} different Arena duels to unlock a second attempt.</p>
              <p className="text-sm text-muted">
                Progress: {status.mission?.votedDuels ?? 0} / {status.mission?.required ?? 3}
              </p>
              <Link
                href="/#duels"
                className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink shadow-sm"
              >
                Go vote in the Arena
              </Link>
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

      {phase === "result" && result && (
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-accent bg-accent-soft/10 p-8 text-center">
          <Trophy className="h-8 w-8 text-accent" />
          <h2 className="font-display text-2xl font-black uppercase text-ink">
            {result.discountPercent > 0 ? `You unlocked ${result.discountPercent}% off` : "No discount this time"}
          </h2>
          <p className="text-sm text-muted">Score: {result.score} / 100</p>
          {result.discountPercent > 0 && result.award && (
            <div className="flex flex-wrap items-center justify-center gap-3">
              <button
                onClick={() => router.push(`/get-listed?discountAward=${result.award!.id}`)}
                className="flex items-center gap-2 rounded-lg bg-accent px-6 py-3 text-sm font-semibold uppercase tracking-wide text-accent-ink shadow-md"
              >
                <CheckCircle2 className="h-4 w-4" />
                Use My Discount
              </button>
              <button
                onClick={() => shareOnX(result.discountPercent)}
                className="flex items-center gap-2 rounded-lg border border-border bg-surface px-6 py-3 text-sm font-semibold text-ink shadow-sm"
              >
                <Share2 className="h-4 w-4" />
                Share on X
              </button>
            </div>
          )}
          <a href="#leaderboard" className="text-xs font-semibold text-accent hover:underline">
            View Leaderboard
          </a>
          <p className="text-xs text-muted">Discounts expire 30 minutes after they&apos;re earned.</p>
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
