"use client";

import type { ReactNode } from "react";
import { Check } from "lucide-react";
import type { MatchWithProducts } from "@/lib/arena-state";
import type { VoteSide } from "@/types/database";
import { PayButton } from "./PayButton";
import { ProductAvatar } from "./ProductAvatar";
import { ShareButtons } from "./ShareButtons";
import { BattlePitch } from "./BattlePitch";
import { XHandleLink } from "./XHandleLink";

const VOTES_TO_WIN = 100;
const NEAR_LOSS_THRESHOLD = VOTES_TO_WIN - 1;
// Kept in sync with BOOST_VOTES / the $5 price in src/lib/arena.ts and
// src/lib/lemonsqueezy.ts (the server-side source of truth for what's
// actually charged/granted) — duplicated here for the same reason
// VOTES_TO_WIN is: this is a client component, and that code is
// server-only. Presentation only; never changes what Boost actually does.
const BOOST_VOTES = 2;
const BOOST_PRICE_LABEL = "$5";

/**
 * The Boost CTA, framed as a move in the current battle rather than a
 * generic "buy votes" upsell — copy reflects the *real* live vote gap
 * (never fake urgency/scarcity), and always states plainly that a boost
 * changes the count, not the outcome.
 */
function BoostMove({
  productId,
  matchId,
  name,
  votes,
  opponentVotes,
  nearLoss,
  onPaid,
}: {
  productId: string;
  matchId: string;
  name: string;
  votes: number;
  opponentVotes: number;
  nearLoss: boolean;
  onPaid?: () => void;
}) {
  const gap = opponentVotes - votes;

  let message: ReactNode;
  if (nearLoss) {
    message = (
      <>
        <strong className="text-danger">One vote from elimination.</strong> Give {name} +
        {BOOST_VOTES} votes to stay in it.
      </>
    );
  } else if (gap > 0) {
    message = (
      <>
        {name} is behind by {gap}. Give it <strong className="text-ink">+{BOOST_VOTES} votes</strong>{" "}
        instantly.
      </>
    );
  } else if (gap === 0) {
    message = (
      <>
        It&apos;s tied. Give {name} the edge with{" "}
        <strong className="text-ink">+{BOOST_VOTES} votes</strong>.
      </>
    );
  } else {
    message = (
      <>
        {name} is ahead. Extend the lead with <strong className="text-ink">+{BOOST_VOTES} votes</strong>.
      </>
    );
  }

  return (
    <div
      className={`flex flex-col gap-2 rounded-lg border p-3 ${
        nearLoss ? "border-danger bg-danger/5" : "border-accent/25 bg-accent-soft/5"
      }`}
    >
      <span
        className={`flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide ${
          nearLoss ? "text-danger" : "text-accent"
        }`}
      >
        ⚔️ Turn the Battle
      </span>
      <p className="text-xs leading-snug text-muted">{message}</p>
      <PayButton
        type="boost"
        productId={productId}
        matchId={matchId}
        onPaid={onPaid}
        label={`${BOOST_PRICE_LABEL} — Boost ${name}`}
        className={`w-full rounded-lg px-3 py-2 text-xs font-semibold shadow-none transition-all duration-150 ease-out active:scale-95 ${
          nearLoss
            ? "border border-danger bg-danger/10 text-danger hover:bg-danger hover:text-danger-ink"
            : "border border-accent/30 bg-accent-soft/10 text-accent hover:bg-accent-soft/20"
        }`}
      />
      <p className="text-[10px] leading-snug text-muted">
        Boost changes the vote count — it doesn&apos;t guarantee the win.
      </p>
    </div>
  );
}

function SideCard({
  productId,
  matchId,
  name,
  pitch,
  url,
  category,
  winStreak,
  votes,
  opponentVotes,
  battlePitch,
  whyUs,
  differentiators,
  xHandle,
  side,
  nearLoss,
  disabled,
  voting,
  votedSide,
  onVote,
  onPaid,
}: {
  productId: string;
  matchId: string;
  name: string;
  pitch: string;
  url: string;
  category: string;
  winStreak: number;
  votes: number;
  opponentVotes: number;
  battlePitch: string | null;
  whyUs: string | null;
  differentiators: string[];
  xHandle: string | null;
  side: VoteSide;
  nearLoss: boolean;
  disabled: boolean;
  voting: boolean;
  votedSide?: VoteSide;
  onVote: (side: VoteSide) => void;
  onPaid?: () => void;
}) {
  const isMyVote = votedSide === side;
  const isOtherSide = disabled && !isMyVote;
  const pct = Math.min(100, (votes / VOTES_TO_WIN) * 100);

  let label = "Vote for this side";
  if (isMyVote) label = "✓ Voted";
  else if (voting) label = "Voting…";
  else if (isOtherSide) label = "Not selected";

  return (
    <div
      className={`flex flex-1 flex-col gap-3 p-4 transition-all duration-150 sm:p-5 ${
        isMyVote ? "rounded-xl bg-accent-soft/10 ring-2 ring-accent" : ""
      } ${nearLoss && !disabled ? "rounded-xl ring-1 ring-danger/60" : ""} ${
        isOtherSide ? "opacity-50" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-3">
          <ProductAvatar name={name} accent={isMyVote} />
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="truncate font-display text-base font-bold text-ink sm:text-lg">{name}</span>
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">
              {category}
            </span>
            <XHandleLink handle={xHandle} />
          </div>
        </div>
        {isMyVote && (
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-accent-ink">
            <Check className="h-3 w-3" />
            Your vote
          </span>
        )}
      </div>

      <p className="line-clamp-2 min-h-[2.2em] text-xs text-muted sm:text-sm">{pitch}</p>

      {winStreak > 0 && (
        <span className="self-start rounded-full bg-surface-2 px-2 py-0.5 font-mono text-[10px] font-bold text-muted">
          🔥 {winStreak} win streak
        </span>
      )}

      <BattlePitch battlePitch={battlePitch} whyUs={whyUs} differentiators={differentiators} />

      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer nofollow"
        className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs font-semibold text-ink shadow-none transition-all duration-150 ease-out hover:-translate-y-0.5 hover:border-accent hover:text-accent active:scale-95"
      >
        Visit Product ↗
      </a>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between">
          <span key={votes} className="font-mono text-2xl font-bold text-ink [animation:slide-up-pop_150ms_ease-out]">
            {votes}
          </span>
          <span className="font-mono text-xs text-muted">of {VOTES_TO_WIN} votes</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
          <div
            className="h-full rounded-full bg-accent transition-all duration-300 ease-out"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <button
        onClick={() => onVote(side)}
        disabled={disabled || voting}
        className={`w-full rounded-lg px-4 py-2.5 text-sm font-semibold shadow-sm transition-all duration-150 ease-out active:scale-95 disabled:active:scale-100 ${
          isMyVote
            ? "bg-accent text-accent-ink shadow-none disabled:opacity-100"
            : isOtherSide
              ? "border border-border bg-surface-2 text-muted shadow-none"
              : "bg-accent text-accent-ink hover:-translate-y-0.5 hover:shadow-md disabled:opacity-40"
        }`}
      >
        {label}
      </button>

      <BoostMove
        productId={productId}
        matchId={matchId}
        name={name}
        votes={votes}
        opponentVotes={opponentVotes}
        nearLoss={nearLoss}
        onPaid={onPaid}
      />
    </div>
  );
}

export function MatchCard({
  match,
  votedSide,
  voting = false,
  onVote,
  onPaid,
}: {
  match: MatchWithProducts;
  votedSide?: VoteSide;
  voting?: boolean;
  onVote: (matchId: string, side: VoteSide) => void;
  onPaid?: () => void;
}) {
  const disabled = votedSide !== undefined;
  const aNearLoss = match.votes_b === NEAR_LOSS_THRESHOLD && match.votes_a < VOTES_TO_WIN;
  const bNearLoss = match.votes_a === NEAR_LOSS_THRESHOLD && match.votes_b < VOTES_TO_WIN;

  const shareText = `${match.product_a.name} vs ${match.product_b.name} is heating up in ${match.category} on The Arena — cast your vote!`;
  const shareUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/?join=${encodeURIComponent(match.category)}`
      : "";

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-md transition-shadow duration-150 ease-out hover:shadow-lg">
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5 sm:px-5">
        <span className="flex items-center gap-1 text-xs font-medium text-muted">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-60" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent" />
          </span>
          Live duel
        </span>
        <ShareButtons url={shareUrl} text={shareText} />
      </div>

      {/* Two equal-weight columns on desktop, stacked with the VS divider
          preserved on mobile — never just one product's card. Both sides
          render through the same SideCard, so no matchup is ever
          hardcoded. */}
      <div className="grid grid-cols-1 divide-y divide-border sm:grid-cols-[1fr_auto_1fr] sm:divide-y-0 sm:divide-x">
        <SideCard
          productId={match.product_a.id}
          matchId={match.id}
          name={match.product_a.name}
          pitch={match.product_a.pitch}
          url={match.product_a.url}
          category={match.category}
          winStreak={match.product_a.wins}
          votes={match.votes_a}
          opponentVotes={match.votes_b}
          battlePitch={match.product_a.battle_pitch}
          whyUs={match.product_a.why_us}
          differentiators={match.product_a.differentiators}
          xHandle={match.product_a.x_handle}
          side="a"
          nearLoss={aNearLoss}
          disabled={disabled}
          voting={voting}
          votedSide={votedSide}
          onVote={(side) => onVote(match.id, side)}
          onPaid={onPaid}
        />
        <div className="flex items-center justify-center px-3 py-2 sm:py-0">
          <span className="flex h-9 w-9 items-center justify-center rounded-full border border-accent bg-accent-soft/15 font-display text-xs font-bold text-accent shadow-sm">
            VS
          </span>
        </div>
        <SideCard
          productId={match.product_b.id}
          matchId={match.id}
          name={match.product_b.name}
          pitch={match.product_b.pitch}
          url={match.product_b.url}
          category={match.category}
          winStreak={match.product_b.wins}
          votes={match.votes_b}
          opponentVotes={match.votes_a}
          battlePitch={match.product_b.battle_pitch}
          whyUs={match.product_b.why_us}
          differentiators={match.product_b.differentiators}
          xHandle={match.product_b.x_handle}
          side="b"
          nearLoss={bNearLoss}
          disabled={disabled}
          voting={voting}
          votedSide={votedSide}
          onVote={(side) => onVote(match.id, side)}
          onPaid={onPaid}
        />
      </div>
      {disabled && (
        <p className="border-t border-border px-4 py-2 text-center text-xs text-muted sm:px-5">
          You can only vote once per duel
        </p>
      )}
    </div>
  );
}
