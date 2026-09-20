import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createRouteHandlerSupabaseClient } from "@/lib/supabase/server";
import { getArenaState } from "@/lib/arena-state";
import { resolveMatchIfComplete, markStaleWaitingProductsUnique } from "@/lib/arena";
import { getClientIp } from "@/lib/fingerprint";
import { rateLimit } from "@/lib/rate-limit";
import { logSecurityEvent } from "@/lib/security-log";
import { checkDuelSprayAbuse } from "@/lib/vote-abuse";
import type { VoteSide } from "@/types/database";

/**
 * Free voting now requires a signed-in Supabase user — see the migration
 * 0014 comment and the top-level task this shipped under for the full
 * rationale. The anonymous fingerprint-cookie system this replaces
 * (lib/fingerprint.ts's getOrCreateSignedVisitorId/hashFingerprint/
 * buildTokenForId, the cast_vote() RPC, and the original
 * unique(match_id, voter_fingerprint) constraint) is deliberately left
 * completely intact — nothing here deletes it. It's simply no longer
 * invoked from this route, since every new vote is now authenticated;
 * historical anonymous vote rows and every anonymous-path helper function
 * remain exactly as they were.
 */
export async function POST(req: NextRequest) {
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
  // *different* duels in a short window — stays IP-scoped and applies
  // regardless of account, since a script signed in with many separately
  // real accounts (each voting once per duel, exactly as the rules allow)
  // is otherwise invisible to any per-account check. Degrades to a no-op
  // if migration 0013 hasn't been applied yet.
  const spray = await checkDuelSprayAbuse(admin, ip, matchId);
  if (spray.blocked) {
    logSecurityEvent("rate_limited_duel_spray", { ip, matchId });
    return NextResponse.json({ error: "Vote unavailable right now." }, { status: 429 });
  }

  // The server-verified identity: getUser() re-checks the token against
  // Supabase's Auth server rather than trusting whatever the cookie says,
  // so a forged/expired/absent session can never be mistaken for a real
  // account. Never trust a client-submitted user id for the same reason
  // the old system never trusted a client-submitted voter id.
  const supabaseAuth = await createRouteHandlerSupabaseClient();
  const {
    data: { user },
  } = await supabaseAuth.auth.getUser();

  if (!user) {
    logSecurityEvent("unauthenticated_vote_attempt", { ip, matchId });
    return NextResponse.json({ error: "Sign in to vote." }, { status: 401 });
  }

  // Per-account limit, the authenticated analog of the old per-fingerprint
  // check: an account is a much stronger identity than a rotatable cookie,
  // but a compromised/scripted account could still burst requests.
  if (!rateLimit(`vote:user:${user.id}`, 30, 60 * 1000)) {
    logSecurityEvent("rate_limited_user", { ip, matchId });
    return NextResponse.json({ error: "Slow down — too many votes." }, { status: 429 });
  }

  const { data: match, error } = await admin.rpc("cast_vote_authenticated", {
    p_match_id: matchId,
    p_user_id: user.id,
    p_side: side as VoteSide,
  });

  if (error) {
    if (error.code === "23505") {
      logSecurityEvent("duplicate_vote_attempt", { ip, matchId, userId: user.id });
      return NextResponse.json({ error: "You already voted in this duel." }, { status: 409 });
    }
    logSecurityEvent("vote_rejected", { ip, matchId, userId: user.id, code: error.code ?? "unknown" });
    return NextResponse.json(
      { error: "This duel is no longer active." },
      { status: 400 },
    );
  }

  logSecurityEvent("vote_success", { ip, matchId, userId: user.id, side });

  if (match) {
    await resolveMatchIfComplete(admin, match);
  }
  await markStaleWaitingProductsUnique(admin);

  const state = await getArenaState(admin);
  return NextResponse.json({ state });
}
