import "server-only";
import type { ChallengeEvent } from "./schedule";
import type { GameValidationStatus } from "@/types/database";

/** What the client reports for one scheduled event — never trusted as-is, only as a claim to check. */
export interface ReportedOutcome {
  eventId: number;
  clicked: boolean;
  reactionMs: number | null;
}

export interface ScoreResult {
  score: number;
  validationStatus: GameValidationStatus;
  targetsHit: number;
  targetsTotal: number;
  decoysHit: number;
  decoysTotal: number;
}

const MIN_HUMAN_REACTION_MS = 60;
const DECOY_HIT_PENALTY = 60;
const DECOY_AVOID_BONUS = 20;
const DURATION_TOLERANCE_MS = 5_000;
const SUSPICIOUS_VIOLATION_THRESHOLD = 2;

function isPlausibleOutcomesShape(value: unknown): value is ReportedOutcome[] {
  return (
    Array.isArray(value) &&
    value.every(
      (o) =>
        o &&
        typeof o === "object" &&
        typeof (o as ReportedOutcome).eventId === "number" &&
        typeof (o as ReportedOutcome).clicked === "boolean" &&
        ((o as ReportedOutcome).reactionMs === null || typeof (o as ReportedOutcome).reactionMs === "number"),
    )
  );
}

/**
 * Re-derives the score entirely server-side from the original
 * server-generated schedule plus the client's claimed per-event outcomes
 * — the client can render the game however it wants, but every claim it
 * makes about what happened is checked against the schedule the server
 * itself generated (see schedule.ts) before it's allowed to contribute to
 * the score. A structurally invalid report (wrong event count, unknown/
 * duplicate ids) is rejected outright; individually implausible timing
 * claims are discarded (treated as a miss) rather than trusted, and
 * enough of them flips the whole attempt to "suspicious" for visibility
 * without silently granting a discount off fabricated data.
 */
export function validateAndScore(
  schedule: ChallengeEvent[],
  rawOutcomes: unknown,
  clientDurationMs: unknown,
  serverElapsedMs: number,
): ScoreResult {
  const empty: ScoreResult = {
    score: 0,
    validationStatus: "rejected",
    targetsHit: 0,
    targetsTotal: schedule.filter((e) => e.type === "target").length,
    decoysHit: 0,
    decoysTotal: schedule.filter((e) => e.type === "decoy").length,
  };

  if (!isPlausibleOutcomesShape(rawOutcomes)) return empty;
  if (rawOutcomes.length !== schedule.length) return empty;

  const scheduleById = new Map(schedule.map((e) => [e.id, e]));
  const seenIds = new Set<number>();
  let violations = 0;

  if (
    typeof clientDurationMs !== "number" ||
    Math.abs(clientDurationMs - serverElapsedMs) > DURATION_TOLERANCE_MS
  ) {
    violations += 1;
  }

  let targetsHit = 0;
  let decoysHit = 0;
  let rawPoints = 0;

  for (const outcome of rawOutcomes) {
    const event = scheduleById.get(outcome.eventId);
    if (!event || seenIds.has(outcome.eventId)) return empty; // unknown or duplicate id — structurally invalid
    seenIds.add(outcome.eventId);

    let clicked = outcome.clicked;
    if (clicked) {
      const reaction = outcome.reactionMs;
      if (reaction === null || reaction < MIN_HUMAN_REACTION_MS || reaction > event.ttlMs) {
        // Physically implausible (faster than a human can react, or later
        // than the target was ever on screen) — don't trust this specific
        // claim, but don't nuke the whole attempt for one bad data point.
        violations += 1;
        clicked = false;
      }
    }

    if (event.type === "target") {
      if (clicked) {
        targetsHit += 1;
        const reaction = outcome.reactionMs as number;
        const speedFactor = Math.max(0.2, Math.min(1, 1 - reaction / event.ttlMs));
        rawPoints += 100 * speedFactor;
      }
    } else {
      if (clicked) {
        decoysHit += 1;
        rawPoints -= DECOY_HIT_PENALTY;
      } else {
        rawPoints += DECOY_AVOID_BONUS;
      }
    }
  }

  const targetsTotal = schedule.filter((e) => e.type === "target").length;
  const decoysTotal = schedule.filter((e) => e.type === "decoy").length;
  const maxPossible = targetsTotal * 100 + decoysTotal * DECOY_AVOID_BONUS;
  const score = maxPossible > 0 ? Math.max(0, Math.min(100, Math.round((rawPoints / maxPossible) * 100))) : 0;

  return {
    score,
    validationStatus: violations >= SUSPICIOUS_VIOLATION_THRESHOLD ? "suspicious" : "valid",
    targetsHit,
    targetsTotal,
    decoysHit,
    decoysTotal,
  };
}
