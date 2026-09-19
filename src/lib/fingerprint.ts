import "server-only";
import crypto from "crypto";
import type { NextRequest } from "next/server";
import { ipAddress } from "@vercel/functions";

export const FINGERPRINT_COOKIE = "arena_vid";
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/**
 * Signing secret for the voter-identity cookie. This is what makes the
 * cookie a *credential* instead of a plain client-chosen string: without
 * knowing this value, nothing can mint a token that `verifyToken` will
 * accept, so a request with no cookie (or an attacker-forged one) can
 * never impersonate an existing voter or bypass the one-vote-per-match DB
 * constraint by simply choosing its own id.
 *
 * A fixed fallback is used ONLY outside production, so local dev works
 * without extra setup. In production, a missing env var means
 * SIGNING_SECRET is null and `isVoterIdentitySigningConfigured()` returns
 * false — the vote route checks this before doing anything else and fails
 * closed (rejects the vote) rather than ever signing/accepting an identity
 * with a value every deployment shares.
 */
const SIGNING_SECRET: string | null =
  process.env.FINGERPRINT_SIGNING_SECRET || (process.env.NODE_ENV === "production" ? null : "arena-dev-signing-secret");

if (process.env.NODE_ENV === "production" && !SIGNING_SECRET) {
  console.error(
    "[security] FINGERPRINT_SIGNING_SECRET is not set in production — voter identity cannot be trusted, so votes will be rejected until this is configured.",
  );
}

/** Whether voter tokens can be signed/verified at all right now — false only in production with the secret unset. */
export function isVoterIdentitySigningConfigured(): boolean {
  return SIGNING_SECRET !== null;
}

function sign(payload: string): string {
  if (!SIGNING_SECRET) throw new Error("FINGERPRINT_SIGNING_SECRET is not configured.");
  return crypto.createHmac("sha256", SIGNING_SECRET).update(payload).digest("hex");
}

/**
 * Verifies a voter token's signature and expiry. Returns the voter id only
 * if the token is exactly one this server issued and it hasn't expired —
 * any tampering (changed id, changed expiry, wrong/missing signature) or a
 * fully client-invented token fails here and is treated identically to no
 * cookie at all, just logged as a distinct (more suspicious) case by the
 * caller.
 */
function verifyToken(token: string): string | null {
  if (!SIGNING_SECRET) return null;

  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [id, expiresAtRaw, signature] = parts;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;

  const expiresAt = Number(expiresAtRaw);
  if (!Number.isFinite(expiresAt) || expiresAt < Math.floor(Date.now() / 1000)) return null;

  const expected = sign(`${id}.${expiresAtRaw}`);
  const a = Buffer.from(signature, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  return id;
}

/**
 * Reads and verifies the visitor's signed token cookie. Never trusts the
 * raw cookie value as-is: a missing cookie is a normal new visitor
 * (`isNew`), while a cookie that fails verification is either an expired
 * token or a forged/tampered one (`wasInvalid`) — the caller applies a
 * stricter IP-based limit to both cases, since minting a "new" identity on
 * demand is exactly the bypass this replaces.
 */
export function getOrCreateSignedVisitorId(req: NextRequest): {
  id: string;
  isNew: boolean;
  wasInvalid: boolean;
} {
  const cookieValue = req.cookies.get(FINGERPRINT_COOKIE)?.value;
  if (!cookieValue) {
    return { id: crypto.randomUUID(), isNew: true, wasInvalid: false };
  }

  const verifiedId = verifyToken(cookieValue);
  if (verifiedId) {
    return { id: verifiedId, isNew: false, wasInvalid: false };
  }

  return { id: crypto.randomUUID(), isNew: true, wasInvalid: true };
}

/** Builds the signed cookie value for a given (already-decided) voter id. */
export function buildTokenForId(id: string): string {
  const expiresAt = Math.floor(Date.now() / 1000) + ONE_YEAR_SECONDS;
  const payload = `${id}.${expiresAt}`;
  return `${payload}.${sign(payload)}`;
}

/** One-way hash of the visitor id — this is what we store, never the raw id. */
export function hashFingerprint(visitorId: string): string {
  const salt = process.env.FINGERPRINT_SALT || "arena-dev-salt";
  return crypto.createHash("sha256").update(`${visitorId}:${salt}`).digest("hex");
}

export const fingerprintCookieOptions = {
  httpOnly: true as const,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  maxAge: ONE_YEAR_SECONDS,
  path: "/",
};

/**
 * Server-trusted client IP, used only as a secondary abuse signal (rate
 * limiting), never as voter identity. On Vercel, `ipAddress()` reads
 * `x-real-ip`, a header Vercel's edge network sets itself and overwrites
 * on the way in — a client-sent copy of that header does not survive to
 * reach this code. Falls back to best-effort header parsing for local dev
 * / non-Vercel hosting, where there is no trusted proxy to rely on anyway.
 */
export function getClientIp(req: NextRequest): string {
  const trusted = ipAddress(req);
  if (trusted) return trusted;

  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip") || "0.0.0.0";
}
