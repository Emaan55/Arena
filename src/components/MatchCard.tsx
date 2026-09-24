"use client";

import type { ReactNode } from "react";
import { Activity, Check, Swords } from "lucide-react";
import type { MatchWithProducts } from "@/lib/arena-state";
import type { VoteSide } from "@/types/database";
import { PayButton } from "./PayButton";
import { ProductAvatar } from "./ProductAvatar";
import { ShareButtons } from "./ShareButtons";
import { BattlePitch } from "./BattlePitch";
import { XHandleLink } from "./XHandleLink";
import { EditProductButton } from "./EditProductButton";

const VOTES_TO_WIN = 100;
const NEAR_LOSS_THRESHOLD = VOTES_TO_WIN - 1;
// Kept in sync with BOOST_VOTES / the $5 price in src/lib/arena.ts and
// src/lib/lemonsqueezy.ts (the server-side source of truth for what's
// actually charged/granted) — duplicated here for the same reason
// VOTES_TO_WIN is: this is a client component, and that code is
// server-only. Presentation only; never changes what Boost actually does.
const BOOST_VOTES = 2;
const BOOST_PRICE_LABEL = "$5";

// A vertically-elongated hexagon, matching the "VS" battle-marker shape
// between the two duel cards.
const HEX_CLIP = "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)";

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
        <Swords className="h-3.5 w-3.5" />
        Turn the Battle
      </span>
      <div className="flex items-start gap-2">
        <span
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
            nearLoss ? "bg-danger/15 text-danger" : "bg-accent-soft/20 text-accent"
          }`}
          aria-hidden="true"
        >
          {name.trim().charAt(0).toUpperCase() || "?"}
        </span>
        <p className="text-xs leading-snug text-muted">{message}</p>
      </div>
      <PayButton
        type="boost"
        productId={productId}
        matchId={matchId}
        onPaid={onPaid}
        label={`${BOOST_PRICE_LABEL}: Boost ${name}`}
        className={`w-full rounded-lg px-3 py-2 text-xs font-semibold shadow-none transition-all duration-150 ease-out active:scale-95 ${
          nearLoss
            ? "border border-danger bg-danger/10 text-danger hover:bg-danger hover:text-danger-ink"
            : "border border-accent/30 bg-accent-soft/10 text-accent hover:bg-accent-soft/20"
        }`}
      />
      <p className="text-[10px] leading-snug text-muted">
        Boost changes the vote count. It doesn&apos;t guarantee the win.
      </p>
    </div>
  );
}

function SideCard({
  productId,
  matchId,
  name,
  logoUrl,
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
  submittedAt,
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
  logoUrl: string | null;
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
  submittedAt: string;
  side: VoteSide;
  nearLoss: boolean;
  disabled: boolean;
  voting: boolean;
  votedSide?: VoteSide;
  onVote: (side: VoteSide) => void;
  onPaid?: () => void;
}) {
  const isMyVote = votedSide === side;
  const pct = Math.min(100, (votes / VOTES_TO_WIN) * 100);

  const borderClass = isMyVote
    ? "border-accent"
    : nearLoss && !disabled
      ? "border-danger/70"
      : "border-border";

  return (
    <div
      className={`flex flex-1 flex-col gap-3 rounded-2xl border bg-surface p-4 shadow-md transition-all duration-150 ease-out sm:p-5 ${borderClass}`}
      style={isMyVote ? { boxShadow: "var(--glow-accent)" } : undefined}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-3">
          <ProductAvatar name={name} logoUrl={logoUrl} accent={isMyVote} />
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="truncate font-display text-base font-bold text-ink sm:text-lg">{name}</span>
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">
              {category}
            </span>
            <XHandleLink handle={xHandle} />
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {isMyVote && (
            <span className="flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-accent-ink">
              <Check className="h-3 w-3" />
              Your vote
            </span>
          )}
          <EditProductButton productId={productId} submittedAt={submittedAt} />
        </div>
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

      {/* Once you've voted, only your own side keeps a button ("Voted") —
          the side you didn't pick has nothing left to click, so it goes
          straight to the Boost move instead of a disabled "Not selected"
          button. */}
      {(!disabled || isMyVote) && (
        <button
          onClick={() => onVote(side)}
          disabled={disabled || voting}
          className={`w-full rounded-lg px-4 py-2.5 text-sm font-semibold shadow-sm transition-all duration-150 ease-out active:scale-95 disabled:active:scale-100 ${
            isMyVote
              ? "bg-accent text-accent-ink shadow-none disabled:opacity-100"
              : "bg-accent text-accent-ink hover:-translate-y-0.5 hover:shadow-md disabled:opacity-40"
          }`}
        >
          {voting ? "Voting…" : isMyVote ? "✓ Voted" : "Vote for this side"}
        </button>
      )}

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

/**
 * Hexagonal "VS" marker between the two duel cards, with thin gradient
 * lines running to the top/bottom edges of the row — stacks flush between
 * the cards on mobile (`min-h`) and stretches to their full height on
 * desktop (`flex-1` inside an `items-stretch` grid row).
 */
function VsDivider() {
  return (
    <div className="flex flex-col items-center justify-center gap-1 px-2 py-1 sm:h-full sm:py-0">
      <span className="min-h-6 w-px flex-1 bg-gradient-to-b from-transparent to-accent/60 sm:min-h-10" />
      <div className="relative h-12 w-11 shrink-0">
        <div className="absolute inset-0" style={{ clipPath: HEX_CLIP, background: "var(--accent)" }} />
        <div
          className="absolute inset-[2px] flex items-center justify-center bg-surface"
          style={{ clipPath: HEX_CLIP }}
        >
          <span className="font-display text-xs font-bold text-accent">VS</span>
        </div>
      </div>
      <span className="min-h-6 w-px flex-1 bg-gradient-to-t from-transparent to-accent/60 sm:min-h-10" />
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

  const shareText = `${match.product_a.name} vs ${match.product_b.name} is heating up in ${match.category} on The Arena, cast your vote!`;
  const shareUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/?join=${encodeURIComponent(match.category)}`
      : "";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between px-1">
        <span className="flex items-center gap-1.5 text-xs font-medium text-muted">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-60" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent" />
          </span>
          Live duel
          <Activity className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
        </span>
        <ShareButtons url={shareUrl} text={shareText} />
      </div>

      {/* Two equal-weight, independently-bordered cards — never just one
          product's card — connected by a "VS" marker. Both sides render
          through the same SideCard, so no matchup is ever hardcoded. */}
      <div className="grid grid-cols-1 gap-1 sm:grid-cols-[1fr_auto_1fr] sm:items-stretch sm:gap-3">
        <SideCard
          productId={match.product_a.id}
          matchId={match.id}
          name={match.product_a.name}
          logoUrl={match.product_a.logo_url}
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
          submittedAt={match.product_a.submitted_at}
          side="a"
          nearLoss={aNearLoss}
          disabled={disabled}
          voting={voting}
          votedSide={votedSide}
          onVote={(side) => onVote(match.id, side)}
          onPaid={onPaid}
        />
        <VsDivider />
        <SideCard
          productId={match.product_b.id}
          matchId={match.id}
          name={match.product_b.name}
          logoUrl={match.product_b.logo_url}
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
          submittedAt={match.product_b.submitted_at}
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
        <p className="px-1 text-center text-xs text-muted">You can only vote once per duel</p>
      )}
    </div>
  );
}
