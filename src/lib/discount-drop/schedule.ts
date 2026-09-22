import "server-only";
import crypto from "crypto";
import { GAME_DURATION_MS } from "./config";

export type ChallengeEventType = "target" | "decoy";

export interface ChallengeEvent {
  id: number;
  type: ChallengeEventType;
  xPct: number;
  yPct: number;
  sizePx: number;
  spawnAtMs: number;
  ttlMs: number;
}

const EVENT_COUNT = 20;
const DECOY_RATIO = 0.25;
const MIN_SIZE_PX = 40;
const MAX_SIZE_PX = 90;
const MIN_TTL_MS = 700;
const MAX_TTL_MS = 1500;

/**
 * Tiny deterministic PRNG (mulberry32) — no dependency needed. The point
 * isn't cryptographic strength, it's reproducibility: given the same
 * seed, the server can always regenerate the exact schedule it originally
 * sent a client, so nothing about "what the game looked like" needs to be
 * trusted from the client at validation time.
 */
function mulberry32(seed: number) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedFromString(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
  }
  return h;
}

export function generateSeed(): string {
  return crypto.randomBytes(16).toString("hex");
}

/** Deterministic: the same seed always produces the exact same schedule. */
export function generateSchedule(seed: string): ChallengeEvent[] {
  const rng = mulberry32(seedFromString(seed));
  const events: ChallengeEvent[] = [];

  // Spread spawn times roughly evenly across the duration with jitter,
  // leaving enough tail room for the last event's own ttl to complete
  // before the game ends.
  const slot = GAME_DURATION_MS / EVENT_COUNT;
  for (let i = 0; i < EVENT_COUNT; i++) {
    const ttlMs = Math.round(MIN_TTL_MS + rng() * (MAX_TTL_MS - MIN_TTL_MS));
    const jitter = rng() * (slot * 0.5);
    const spawnAtMs = Math.min(
      GAME_DURATION_MS - ttlMs - 50,
      Math.round(i * slot + jitter),
    );
    events.push({
      id: i,
      type: rng() < DECOY_RATIO ? "decoy" : "target",
      xPct: Math.round(10 + rng() * 80),
      yPct: Math.round(10 + rng() * 80),
      sizePx: Math.round(MIN_SIZE_PX + rng() * (MAX_SIZE_PX - MIN_SIZE_PX)),
      spawnAtMs: Math.max(0, spawnAtMs),
      ttlMs,
    });
  }

  return events;
}
