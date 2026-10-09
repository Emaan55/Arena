import "server-only";
import { createHmac, randomUUID } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";
export const ANALYTICS_COOKIE = "arena_analytics_vid";
const BOT_RE = /bot|crawl|spider|slurp|preview|facebookexternalhit|twitterbot|discordbot|whatsapp|telegrambot|headless/i;
export function isAnalyticsBot(userAgent: string | null) { return !userAgent || BOT_RE.test(userAgent); }
export function analyticsVisitorId(req: NextRequest) {
  const existing = req.cookies.get(ANALYTICS_COOKIE)?.value;
  return existing && /^[0-9a-f-]{36}$/i.test(existing) ? existing : randomUUID();
}
export function analyticsPageViewEventId(visitorId: string, productId: string, bucket: number) {
  return analyticsEventId("view", visitorId, productId, bucket);
}
export function analyticsClickEventId(visitorId: string, productId: string, bucket: number) {
  return analyticsEventId("click", visitorId, productId, bucket);
}
function analyticsEventId(kind: string, visitorId: string, productId: string, bucket: number) {
  const secret = process.env.FINGERPRINT_SIGNING_SECRET || process.env.FINGERPRINT_SALT || (process.env.NODE_ENV === "production" ? "" : "arena-local-analytics");
  if (!secret) throw new Error("Analytics hashing secret is not configured");
  const bytes = createHmac("sha256", secret).update(`${kind}:${visitorId}:${productId}:${bucket}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
export function visitorDayHash(visitorId: string, day: string) {
  const secret = process.env.FINGERPRINT_SIGNING_SECRET || process.env.FINGERPRINT_SALT || (process.env.NODE_ENV === "production" ? "" : "arena-local-analytics");
  if (!secret) throw new Error("Analytics hashing secret is not configured");
  return createHmac("sha256", secret).update(`${visitorId}:${day}`).digest("hex");
}
export function setAnalyticsCookie(response: NextResponse, visitorId: string) {
  response.cookies.set(ANALYTICS_COOKIE, visitorId, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
}
export function utcAnalyticsDay() { return new Date().toISOString().slice(0, 10); }
