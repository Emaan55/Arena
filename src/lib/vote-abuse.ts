import "server-only";
import crypto from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { logSecurityEvent } from "@/lib/security-log";

type AdminClient = SupabaseClient<Database>;

// Multiple windows of different granularity is what makes this
// "progressive" without a scoring model: a normal shared IP minting one
// new anonymous identity every so often never comes close to any of
// these; a script rotating identities trips the tight burst window almost
// immediately, well before the sustained window's ceiling matters. A
// forged/garbled cookie (not just a missing one) is a stronger signal on
// its own, so it gets its own, stricter budget. None of these numbers
// change the actual vote-integrity guarantee (the DB unique constraint) —
// they only decide how many *new identities* one IP can mint before
// further attempts are throttled.
const NEW_IDENTITY_BURST_LIMIT = 4;
const NEW_IDENTITY_BURST_WINDOW_S = 60;
const NEW_IDENTITY_SUSTAINED_LIMIT = 12; // same ceiling as the existing policy, now durable across instances
const NEW_IDENTITY_SUSTAINED_WINDOW_S = 10 * 60;
const INVALID_TOKEN_LIMIT = 8;
const INVALID_TOKEN_WINDOW_S = 10 * 60;

// "Vote spraying": one IP attempting to vote across an unusually large
// number of *different* duels in a short window. This is the one signal
// applied regardless of whether the identity used is valid or new,
// because the attack it targets (many pre-minted valid-looking identities,
// each used exactly once per duel, sprayed rapidly across many duels) is
// otherwise invisible to per-identity checks — each individual vote looks
// legitimate. The threshold is set well above plausible fast human
// browsing (reading a pitch + clicking vote every few seconds, sustained,
// would still need over a minute to reach it).
const DUEL_BREADTH_LIMIT = 15;
const DUEL_BREADTH_WINDOW_S = 2 * 60;

/** Opaque, non-reversible lookup key — the raw IP is never written to the DB. */
function hashIp(ip: string): string {
  const salt = process.env.FINGERPRINT_SALT || "arena-dev-salt";
  return crypto.createHash("sha256").update(`ip:${ip}:${salt}`).digest("hex");
}

async function bumpWindow(
  admin: AdminClient,
  ipHash: string,
  eventType: string,
  windowSeconds: number,
): Promise<number | null> {
  const { data, error } = await admin.rpc("bump_abuse_window", {
    p_ip_hash: ipHash,
    p_event_type: eventType,
    p_window_seconds: windowSeconds,
  });
  if (error) {
    // Most likely migration 0013 hasn't been run yet — degrade gracefully
    // rather than failing votes outright. The existing in-memory new-voter
    // limiter (lib/rate-limit.ts) stays active regardless, so protection
    // is never fully lost, only less durable, until the migration runs.
    logSecurityEvent("abuse_tracking_unavailable", { reason: error.message || "unknown" });
    return null;
  }
  return data as number;
}

/**
 * Call when a request is minting a new or invalid voter identity (i.e. no
 * valid signed arena_vid was presented). Bumps three persistent counters
 * for this IP and reports whether any of them is now over budget. Safe to
 * call even if migration 0013 hasn't been applied — returns `blocked:
 * false` and logs that the signal is unavailable, so this never makes
 * voting *less* available than before.
 */
export async function checkNewIdentityAbuse(
  admin: AdminClient,
  ip: string,
  wasInvalid: boolean,
): Promise<{ blocked: boolean }> {
  const ipHash = hashIp(ip);

  const [burst, sustained, invalidCount] = await Promise.all([
    bumpWindow(admin, ipHash, "new_identity_burst", NEW_IDENTITY_BURST_WINDOW_S),
    bumpWindow(admin, ipHash, "new_identity_sustained", NEW_IDENTITY_SUSTAINED_WINDOW_S),
    wasInvalid ? bumpWindow(admin, ipHash, "invalid_token", INVALID_TOKEN_WINDOW_S) : Promise.resolve(null),
  ]);

  if (burst !== null && burst > NEW_IDENTITY_BURST_LIMIT) return { blocked: true };
  if (sustained !== null && sustained > NEW_IDENTITY_SUSTAINED_LIMIT) return { blocked: true };
  if (invalidCount !== null && invalidCount > INVALID_TOKEN_LIMIT) return { blocked: true };

  return { blocked: false };
}

/**
 * Call for every vote attempt (valid or new identity alike) once the
 * intended match id is known, before recording the vote. Reports whether
 * this IP has attempted an unusually large number of *different* duels
 * within the short breadth window. Same graceful-degradation behavior as
 * above if migration 0013 hasn't run yet.
 */
export async function checkDuelSprayAbuse(admin: AdminClient, ip: string, matchId: string): Promise<{ blocked: boolean }> {
  const ipHash = hashIp(ip);
  const { data, error } = await admin.rpc("record_recent_match_and_count", {
    p_ip_hash: ipHash,
    p_match_id: matchId,
    p_window_seconds: DUEL_BREADTH_WINDOW_S,
  });
  if (error) {
    logSecurityEvent("abuse_tracking_unavailable", { reason: error.message || "unknown" });
    return { blocked: false };
  }
  return { blocked: (data as number) > DUEL_BREADTH_LIMIT };
}
