import { createHmac, timingSafeEqual } from "node:crypto";

export type NotificationEmailCategory = "transactional" | "duel" | "review" | "digest" | "announcement" | "get_listed";
const PREF: Partial<Record<NotificationEmailCategory, string>> = { duel: "important_duel_updates", review: "review_notifications", digest: "daily_vote_digest", announcement: "product_announcements", get_listed: "get_listed_updates" };

export function escapeEmailHtml(value: string) {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
}
export function isEmailAllowed(category: NotificationEmailCategory, preferences: Record<string, boolean> | null) {
  if (category === "transactional") return true;
  const key = PREF[category];
  return Boolean(key && (preferences?.[key] ?? false));
}
function sign(userId: string, category: string) {
  const secret = process.env.NOTIFICATION_UNSUBSCRIBE_SECRET;
  if (!secret) throw new Error("NOTIFICATION_UNSUBSCRIBE_SECRET is not configured");
  return createHmac("sha256", secret).update(`${userId}:${category}`).digest("base64url");
}
export function createUnsubscribeToken(userId: string, category: string) {
  if (!["duel", "review", "digest", "announcement", "get_listed"].includes(category)) throw new Error("Invalid optional email category");
  return `${Buffer.from(`${userId}:${category}`).toString("base64url")}.${sign(userId, category)}`;
}
export function verifyUnsubscribeToken(token: string) {
  try {
    const [encoded, signature, extra] = token.split(".");
    if (!encoded || !signature || extra) return null;
    const payload = Buffer.from(encoded, "base64url").toString("utf8");
    const split = payload.lastIndexOf(":");
    if (split < 1) return null;
    const userId = payload.slice(0, split);
    const category = payload.slice(split + 1);
    if (!["duel", "review", "digest", "announcement", "get_listed"].includes(category)) return null;
    const expected = Buffer.from(sign(userId, category));
    const received = Buffer.from(signature);
    if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null;
    return { userId, category };
  } catch { return null; }
}
