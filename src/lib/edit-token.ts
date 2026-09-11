import "server-only";
import crypto from "crypto";

/**
 * Lightweight "ownership" for a product without a full auth system: at
 * submission time we generate a random token, return the plaintext to the
 * submitter exactly once (never stored anywhere but their browser), and
 * persist only its hash. Editing a product later requires presenting that
 * token, which we re-hash and compare — same pattern as the voter
 * fingerprint in lib/fingerprint.ts.
 */
export function generateEditToken(): string {
  return crypto.randomBytes(24).toString("base64url");
}

export function hashEditToken(token: string): string {
  const salt = process.env.FINGERPRINT_SALT || "arena-dev-salt";
  return crypto.createHash("sha256").update(`edit-token:${token}:${salt}`).digest("hex");
}
