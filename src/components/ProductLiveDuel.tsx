"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { MatchCard } from "./MatchCard";
import { useAuthUser } from "@/lib/useAuthUser";
import type { MatchWithProducts } from "@/lib/arena-state";
import type { VoteSide } from "@/types/database";

const VOTED_STORAGE_KEY = "arena_voted_matches";

function loadVotedMap(): Record<string, VoteSide> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(VOTED_STORAGE_KEY) ?? "{}");
  } catch {
    return {};
  }
}

function saveVote(matchId: string, side: VoteSide) {
  const map = loadVotedMap();
  map[matchId] = side;
  window.localStorage.setItem(VOTED_STORAGE_KEY, JSON.stringify(map));
}

/**
 * Standalone duel embed for a product's own page — reuses MatchCard, but
 * owns its own vote state instead of the homepage's ArenaApp state, since
 * this renders inside a server-rendered page rather than the client-side
 * arena tree. Refreshes the whole page via the router after a vote/payment
 * so the surrounding product detail (status, history) stays in sync too.
 */
export function ProductLiveDuel({ match }: { match: MatchWithProducts }) {
  const router = useRouter();
  const pathname = usePathname();
  const [votedSide, setVotedSide] = useState<VoteSide | undefined>(undefined);
  const [voting, setVoting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { user, loading: authLoading } = useAuthUser();
  const resumedVote = useRef(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVotedSide(loadVotedMap()[match.id]);
  }, [match.id]);

  function redirectToSignIn(matchId: string, side: VoteSide) {
    const next = `${pathname}?resumeVote=${matchId}:${side}`;
    router.push(`/auth/sign-in?next=${encodeURIComponent(next)}`);
  }

  async function handleVote(matchId: string, side: VoteSide) {
    if (!user) {
      redirectToSignIn(matchId, side);
      return;
    }
    setVoting(true);
    setError(null);
    try {
      const res = await fetch("/api/votes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchId, side }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 401) {
          redirectToSignIn(matchId, side);
          return;
        }
        setError(data.error ?? "Could not cast vote.");
        if (res.status === 409) {
          saveVote(matchId, side);
          setVotedSide(side);
        }
        return;
      }
      saveVote(matchId, side);
      setVotedSide(side);
      router.refresh();
    } catch {
      setError("Network error — please try again.");
    } finally {
      setVoting(false);
    }
  }

  useEffect(() => {
    // Same cross-tab resume mechanism as ArenaApp — see /auth/sign-in.
    if (authLoading || !user || resumedVote.current) return;
    const params = new URLSearchParams(window.location.search);
    const resume = params.get("resumeVote");
    if (!resume) return;
    const [matchId, side] = resume.split(":");
    if (matchId === match.id && (side === "a" || side === "b")) {
      resumedVote.current = true;
      window.history.replaceState({}, "", window.location.pathname);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- resuming a vote the visitor explicitly started before signing in, not a render-driven side effect
      handleVote(matchId, side as VoteSide);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading]);

  return (
    <div className="flex flex-col gap-2">
      <MatchCard
        match={match}
        votedSide={votedSide}
        voting={voting}
        onVote={handleVote}
        onPaid={() => router.refresh()}
      />
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
