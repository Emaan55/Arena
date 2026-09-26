"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight } from "lucide-react";
import type { ArenaState } from "@/lib/arena-state";
import { CATEGORIES, type Category, type Product, type VoteSide } from "@/types/database";
import { SubmitForm } from "./SubmitForm";
import { CategoryTabs, type TabValue } from "./CategoryTabs";
import { MatchCard } from "./MatchCard";
import { HallOfFame } from "./HallOfFame";
import { EliminatedList } from "./EliminatedList";
import { ActivityFeed } from "./ActivityFeed";
import { WaitingCard } from "./WaitingCard";
import { ArenaBackdrop } from "./ArenaBackdrop";
import { DuelBackdrop } from "./DuelBackdrop";
import { SponsoredSection } from "./SponsoredSection";
import { StatsRow } from "./StatsRow";
import { HowItWorks } from "./HowItWorks";
import { Leaderboard } from "./Leaderboard";
import { PowerMoves } from "./PowerMoves";
import { ScrollReveal } from "./ScrollReveal";
import { BrandLogo } from "./BrandLogo";
import { useAuthUser } from "@/lib/useAuthUser";

const POLL_MS = 5000;
const VOTED_STORAGE_KEY = "arena_voted_matches";

function loadVotedMap(): Record<string, VoteSide> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(VOTED_STORAGE_KEY) ?? "{}");
  } catch {
    return {};
  }
}

export function ArenaApp({ initialState }: { initialState: ArenaState }) {
  const router = useRouter();
  const [state, setState] = useState(initialState);
  const [tab, setTab] = useState<TabValue>("All");
  const [votedMap, setVotedMap] = useState<Record<string, VoteSide>>({});
  const [pendingVotes, setPendingVotes] = useState<Set<string>>(new Set());
  const [voteError, setVoteError] = useState<string | null>(null);
  // Only set for the exact duel just voted on, this session — never
  // persisted, never re-shown on a later visit or reload of an
  // already-voted match (see castVote/markVoted below).
  const [justVotedMatchId, setJustVotedMatchId] = useState<string | null>(null);
  const [challenge, setChallenge] = useState<{ category: Category; from: string } | null>(null);
  const inFlight = useRef(false);
  const { user, loading: authLoading } = useAuthUser();
  const resumedVote = useRef(false);

  useEffect(() => {
    // Hydrate from localStorage after mount (not in the lazy useState
    // initializer) so the client's first render matches the server's
    // window-less render, avoiding a hydration mismatch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVotedMap(loadVotedMap());

    const params = new URLSearchParams(window.location.search);
    const joinCategory = params.get("join");
    const from = params.get("from");
    if (joinCategory && (CATEGORIES as readonly string[]).includes(joinCategory)) {
      setTab(joinCategory as Category);
      setChallenge({ category: joinCategory as Category, from: from || "A founder" });
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  async function refreshState() {
    try {
      const res = await fetch("/api/state");
      if (res.ok) setState(await res.json());
    } catch {
      // best-effort refresh; ignore transient network errors
    }
  }

  useEffect(() => {
    const id = setInterval(() => {
      if (!inFlight.current) refreshState();
    }, POLL_MS);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    // Returning from /auth/sign-in (or, for a new account, from clicking
    // the verification email, which signs itself in): `next` carried
    // `?resumeVote=<matchId>:<side>` all the way through, so this finishes
    // the exact vote that was interrupted — works even across devices/tabs,
    // which sessionStorage alone couldn't do.
    if (authLoading || !user || resumedVote.current) return;
    const params = new URLSearchParams(window.location.search);
    const resume = params.get("resumeVote");
    if (!resume) return;
    const [matchId, side] = resume.split(":");
    if (matchId && (side === "a" || side === "b")) {
      resumedVote.current = true;
      window.history.replaceState({}, "", window.location.pathname);
      castVote(matchId, side as VoteSide);
    }
  }, [user, authLoading]);

  function markVoted(matchId: string, side: VoteSide) {
    setVotedMap((prev) => {
      const next = { ...prev, [matchId]: side };
      window.localStorage.setItem(VOTED_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }

  function redirectToSignIn(matchId: string, side: VoteSide) {
    const next = `/?resumeVote=${matchId}:${side}`;
    router.push(`/auth/sign-in?next=${encodeURIComponent(next)}`);
  }

  async function castVote(matchId: string, side: VoteSide) {
    if (votedMap[matchId] || pendingVotes.has(matchId)) return;
    if (!user) {
      redirectToSignIn(matchId, side);
      return;
    }
    setVoteError(null);
    setPendingVotes((prev) => new Set(prev).add(matchId));
    inFlight.current = true;
    try {
      const res = await fetch("/api/votes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchId, side }),
      });
      const data = await res.json();
      if (!res.ok) {
        // Session expired between page load and this click (client-side
        // `user` was stale) — fall back to the same sign-in prompt rather
        // than just showing an error, so a hung session doesn't dead-end
        // an otherwise-legitimate vote attempt.
        if (res.status === 401) {
          redirectToSignIn(matchId, side);
          return;
        }
        setVoteError(data.error ?? "Could not cast vote.");
        // A 409 means a vote under this identity already exists for this
        // match — lock the button locally too. Any other failure (rate
        // limit, network hiccup, resolved match) leaves it retryable.
        if (res.status === 409) markVoted(matchId, side);
        return;
      }
      markVoted(matchId, side);
      setJustVotedMatchId(matchId);
      if (data.state) setState(data.state);
    } catch {
      setVoteError("Network error, please try again.");
    } finally {
      inFlight.current = false;
      setPendingVotes((prev) => {
        const next = new Set(prev);
        next.delete(matchId);
        return next;
      });
    }
  }

  function handleSubmitted(product: Product, freshState: ArenaState) {
    setState(freshState);
    setTab(product.category);
  }

  const filtered = useMemo(() => {
    const inCategory = <T extends { category: string }>(items: T[]) =>
      tab === "All" ? items : items.filter((i) => i.category === tab);
    return {
      matches: inCategory(state.matches),
      waiting: inCategory(state.waiting),
      unique: inCategory(state.unique),
      eliminated: inCategory(state.eliminated),
      champions: inCategory(state.champions),
    };
  }, [state, tab]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { All: state.matches.length };
    for (const m of state.matches) c[m.category] = (c[m.category] ?? 0) + 1;
    return c;
  }, [state.matches]);

  return (
    <main className="flex flex-col">
      {/* Hero */}
      <section className="relative overflow-hidden px-6 pb-14 pt-16 text-center sm:pt-24">
        <ArenaBackdrop />
        <div className="relative mx-auto flex max-w-3xl flex-col items-center gap-6">
          <h1 className="font-display text-4xl font-black leading-[1.08] text-ink sm:text-6xl">
            Products fight.
            <br />
            <span className="text-accent">Winners live forever.</span>
          </h1>
          <p className="max-w-lg text-base text-muted sm:text-lg">
            Free to enter. Win 3 duels to become a permanent Hall of Fame champion.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <a
              href="#submit"
              className="rounded-lg bg-accent px-6 py-3 text-sm font-semibold text-accent-ink shadow-md transition-all duration-150 ease-out hover:-translate-y-0.5 hover:shadow-lg active:scale-95"
            >
              Submit Your Product
            </a>
            <a
              href="#duels"
              className="rounded-lg border border-border bg-surface px-6 py-3 text-sm font-semibold text-ink shadow-sm transition-all duration-150 ease-out hover:-translate-y-0.5 hover:shadow-md active:scale-95"
            >
              Explore Arenas
            </a>
          </div>
          <div className="mt-6 flex justify-center">
            <StatsRow stats={state.stats} />
          </div>
        </div>
      </section>

      {/* Submission form */}
      <section className="px-6 pb-16">
        <SubmitForm onSubmitted={handleSubmitted} />
      </section>

      {/* How it works */}
      <ScrollReveal>
        <section id="how-it-works" className="border-t border-border px-6 py-16 md:px-10">
          <div className="mx-auto flex max-w-5xl flex-col gap-10">
            <h2 className="text-center font-display text-2xl font-bold text-ink sm:text-3xl">
              How The <span className="text-accent">Arena</span> Works
            </h2>
            <HowItWorks />
          </div>
        </section>
      </ScrollReveal>

      {/* Sponsored */}
      <SponsoredSection sponsorship={state.sponsorship} onPaid={refreshState} />

      {/* Duels */}
      <section id="duels" className="border-t border-border px-6 py-16 md:px-10">
        <div className="mx-auto flex max-w-6xl flex-col gap-10 lg:flex-row lg:items-start">
          <div className="flex flex-1 flex-col gap-8">
            {challenge && (
              <div className="flex items-center justify-between gap-3 rounded-xl border border-accent bg-accent-soft/10 px-5 py-3 shadow-sm">
                <p className="text-sm text-ink">
                  <strong>{challenge.from}</strong> is waiting for a challenger in{" "}
                  <strong>{challenge.category}</strong>. Submit your product above to start the
                  duel!
                </p>
                <button
                  onClick={() => setChallenge(null)}
                  className="shrink-0 text-sm text-muted transition-transform duration-150 ease-out hover:text-ink active:scale-90"
                  aria-label="Dismiss"
                >
                  ✕
                </button>
              </div>
            )}

            <div className="flex flex-col gap-4">
              <CategoryTabs selected={tab} onSelect={setTab} counts={counts} />
              {voteError && <p className="text-sm text-danger">{voteError}</p>}
            </div>

            {filtered.waiting.length > 0 && (
              <div className="flex flex-col gap-3">
                {filtered.waiting.map((p) => (
                  <WaitingCard key={p.id} product={p} />
                ))}
              </div>
            )}

            {filtered.unique.length > 0 && (
              <div className="flex flex-col gap-4">
                <h2 className="font-display text-xl font-bold text-ink">Unique Products</h2>
                <p className="-mt-2 text-sm text-muted">
                  No rival showed up within 7 days, these products haven&apos;t won anything yet
                  and stay off the leaderboard, but they&apos;re still open to a challenge.
                </p>
                <div className="flex flex-col gap-3">
                  {filtered.unique.map((p) => (
                    <WaitingCard key={p.id} product={p} variant="unique" />
                  ))}
                </div>
              </div>
            )}

            <div className="flex flex-col gap-4">
              <h2 className="font-display text-xl font-bold text-ink">Live Duels</h2>
              {filtered.matches.length === 0 ? (
                <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted">
                  No active duels{tab !== "All" ? ` in ${tab}` : ""} right now. Submit a
                  product to start one.
                </p>
              ) : (
                <div className="relative grid gap-5 p-3 sm:p-5">
                  <DuelBackdrop />
                  {filtered.matches.map((m) => (
                    <MatchCard
                      key={m.id}
                      match={m}
                      votedSide={votedMap[m.id]}
                      voting={pendingVotes.has(m.id)}
                      onVote={castVote}
                      onPaid={refreshState}
                      showReviewPrompt={justVotedMatchId === m.id}
                      onReviewDone={() => setJustVotedMatchId(null)}
                    />
                  ))}
                </div>
              )}
            </div>

            <div className="flex flex-col gap-4">
              <h2 className="font-display text-xl font-bold text-ink">Eliminated</h2>
              <EliminatedList products={filtered.eliminated} onPaid={refreshState} />
            </div>
          </div>

          <aside className="flex w-full flex-col gap-6 lg:sticky lg:top-20 lg:w-80">
            <Leaderboard products={state.topProducts} />
            <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-display text-sm font-bold text-ink">Activity</h2>
                <span className="flex items-center gap-1 rounded-full border border-border bg-surface-2 px-2 py-0.5 text-[10px] font-semibold text-muted">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-60" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent" />
                  </span>
                  Live Feed
                  <ChevronRight className="h-3 w-3" />
                </span>
              </div>
              <ActivityFeed activity={state.activity} />
            </div>
          </aside>
        </div>
      </section>

      {/* Hall of Fame */}
      <ScrollReveal>
        <section id="hall-of-fame" className="border-t border-border px-6 py-16 md:px-10">
          <div className="mx-auto flex max-w-6xl flex-col gap-6">
            <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
              Hall of Fame <span className="text-accent">Champions</span>
            </h2>
            <HallOfFame champions={state.champions} onPaid={refreshState} />
          </div>
        </section>
      </ScrollReveal>

      {/* Power moves */}
      <ScrollReveal>
        <section className="border-t border-border px-6 py-16 md:px-10">
          <div className="mx-auto flex max-w-5xl flex-col gap-8">
            <h2 className="text-center font-display text-2xl font-bold text-ink sm:text-3xl">
              Power Moves <span className="text-base font-normal text-muted">(Optional)</span>
            </h2>
            <PowerMoves />
          </div>
        </section>
      </ScrollReveal>

      {/* About */}
      <ScrollReveal>
        <section id="about" className="border-t border-border px-6 py-16 text-center">
          <div className="mx-auto flex max-w-xl flex-col items-center gap-4">
            <h2 className="sr-only">About The Arena</h2>
            <BrandLogo variant="wordmark" className="h-14 max-w-full aspect-[1092/756]" />
            <p className="text-sm text-muted">
              The Arena is a free, head-to-head battle platform for products. Submit yours,
              get paired against a rival in your category, and let real votes decide who
              wins. Win three duels in a row and your name is added to the Hall of Fame,
              permanently.
            </p>
          </div>
        </section>
      </ScrollReveal>
    </main>
  );
}
