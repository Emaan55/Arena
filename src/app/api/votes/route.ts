import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { getArenaState } from "@/lib/arena-state";
import { resolveMatchIfComplete, markStaleWaitingProductsUnique } from "@/lib/arena";
import {
  FINGERPRINT_COOKIE,
  fingerprintCookieOptions,
  getClientIp,
  getOrCreateSignedVisitorId,
  buildTokenForId,
  hashFingerprint,
  isVoterIdentitySigningConfigured,
} from "@/lib/fingerprint";
import { rateLimit } from "@/lib/rate-limit";
import { logSecurityEvent } from "@/lib/security-log";
import { checkNewIdentityAbuse, checkDuelSprayAbuse } from "@/lib/vote-abuse";
import type { VoteSide } from "@/types/database";

// Minting a "new" voter identity is the one thing a request can trigger
// without presenting a valid prior credential, so it's the actual bypass
// path for "clear cookies / call the API directly and vote repeatedly" —
// the per-fingerprint limiter below is useless against that because the
// fingerprint itself is freshly generated every time. This limits how many
// such fresh identities (including ones from a rejected/forged/expired
// cookie) one IP can produce in a short window. Kept generous enough that
// a shared/NAT'd IP of genuine first-time visitors won't be affected —
// legitimate visitors only ever hit this once, since they get a
// year-long signed cookie afterward.
const NEW_VOTER_LIMIT = 12;
const NEW_VOTER_WINDOW_MS = 10 * 60 * 1000;

export async function POST(req: NextRequest) {
  if (!isVoterIdentitySigningConfigured()) {
    // Production with FINGERPRINT_SIGNING_SECRET unset: every deployment
    // would otherwise share the same fallback secret, making every voter
    // token forgeable. Fail closed instead of accepting an unsigned/
    // uniformly-signable identity.
    logSecurityEvent("voter_signing_unconfigured", {});
    return NextResponse.json({ error: "Vote unavailable right now." }, { status: 503 });
  }

  const ip = getClientIp(req);
  if (!rateLimit(`vote:ip:${ip}`, 30, 60 * 1000)) {
    logSecurityEvent("rate_limited_ip", { ip });
    return NextResponse.json({ error: "Slow down — too many votes." }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    logSecurityEvent("malformed_body", { ip });
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { matchId, side } = (body ?? {}) as Record<string, unknown>;
  if (typeof matchId !== "string" || (side !== "a" && side !== "b")) {
    logSecurityEvent("malformed_vote", { ip, matchId: typeof matchId === "string" ? matchId : "invalid" });
    return NextResponse.json({ error: "Invalid vote." }, { status: 400 });
  }

  const admin = createAdminSupabaseClient();

  // "Vote spraying" — one IP attempting an unusually large number of
  // *different* duels in a short window — applies regardless of whether
  // this request's identity is new or an already-valid returning voter,
  // since a script using many separately-legitimate identities (each
  // voting once per duel, exactly as the rules allow) is otherwise
  // invisible to any per-identity check. Degrades to a no-op if migration
  // 0013 hasn't been applied yet, so this never blocks a vote it can't
  // actually evaluate.
  const spray = await checkDuelSprayAbuse(admin, ip, matchId);
  if (spray.blocked) {
    logSecurityEvent("rate_limited_duel_spray", { ip, matchId });
    return NextResponse.json({ error: "Vote unavailable right now." }, { status: 429 });
  }

  const { id: visitorId, isNew, wasInvalid } = getOrCreateSignedVisitorId(req);

  if (wasInvalid) {
    // A cookie was presented but failed signature/expiry verification —
    // either expired naturally or was tampered with/forged. Either way we
    // can't trust it as an identity, so it's treated as a new voter below,
    // but it's a stronger abuse signal than simply having no cookie.
    logSecurityEvent("invalid_voter_token", { ip, matchId });
  }

  if (isNew || wasInvalid) {
    // In-memory check first: always available, zero latency, and alone is
    // exactly the protection already shipped. The persistent check below
    // is additive — it never weakens this, only adds a cross-serverless-
    // instance-durable ceiling plus a much tighter burst window and
    // invalid-token weighting, once migration 0013 has been applied.
    if (!rateLimit(`vote:newvoter:${ip}`, NEW_VOTER_LIMIT, NEW_VOTER_WINDOW_MS)) {
      logSecurityEvent("rate_limited_new_voter", { ip, matchId, wasInvalid });
      return NextResponse.json({ error: "Vote unavailable right now." }, { status: 429 });
    }

    const abuse = await checkNewIdentityAbuse(admin, ip, wasInvalid);
    if (abuse.blocked) {
      logSecurityEvent("rate_limited_new_voter_persistent", { ip, matchId, wasInvalid });
      return NextResponse.json({ error: "Vote unavailable right now." }, { status: 429 });
    }
  }

  const voterHash = hashFingerprint(visitorId);

  // Per-visitor limit in addition to per-IP: IP alone can false-positive on
  // shared/NAT'd networks, and this catches a bot cycling IPs but reusing
  // one visitor id.
  if (!rateLimit(`vote:fp:${voterHash}`, 30, 60 * 1000)) {
    logSecurityEvent("rate_limited_fingerprint", { ip, matchId });
    return NextResponse.json({ error: "Slow down — too many votes." }, { status: 429 });
  }

  const { data: match, error } = await admin.rpc("cast_vote", {
    p_match_id: matchId,
    p_fingerprint: voterHash,
    p_side: side as VoteSide,
  });

  if (error) {
    if (error.code === "23505") {
      logSecurityEvent("duplicate_vote_attempt", { ip, matchId });
      return NextResponse.json({ error: "You already voted in this duel." }, { status: 409 });
    }
    logSecurityEvent("vote_rejected", { ip, matchId, code: error.code ?? "unknown" });
    return NextResponse.json(
      { error: "This duel is no longer active." },
      { status: 400 },
    );
  }

  logSecurityEvent("vote_success", { ip, matchId, side, isNew });

  if (match) {
    await resolveMatchIfComplete(admin, match);
  }
  await markStaleWaitingProductsUnique(admin);

  const state = await getArenaState(admin);
  const res = NextResponse.json({ state });
  if (isNew || wasInvalid) {
    res.cookies.set(FINGERPRINT_COOKIE, buildTokenForId(visitorId), fingerprintCookieOptions);
  }
  return res;
}
