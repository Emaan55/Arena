import "server-only";
import crypto from "crypto";
import type { NextRequest } from "next/server";

/**
 * The whole app has no account system, so the admin panel is gated by a
 * single shared secret (`ADMIN_SECRET`, set only in the server environment)
 * sent as the `x-admin-secret` header — never a session cookie or JWT,
 * there's nothing to log in as other than "the founder." Constant-time
 * compare so response timing can't be used to guess the secret
 * character-by-character.
 */
export function isAuthorizedAdmin(req: NextRequest): boolean {
  const secret = process.env.ADMIN_SECRET;
  const header = req.headers.get("x-admin-secret");
  if (!secret || !header) return false;

  const a = Buffer.from(header);
  const b = Buffer.from(secret);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
