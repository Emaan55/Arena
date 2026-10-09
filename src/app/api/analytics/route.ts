import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { getClientIp } from "@/lib/fingerprint";
import { rateLimit } from "@/lib/rate-limit";
import { analyticsPageViewEventId, analyticsVisitorId, isAnalyticsBot, setAnalyticsCookie, utcAnalyticsDay, visitorDayHash } from "@/lib/product-analytics";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (origin) { try { if (new URL(origin).host !== req.headers.get("host")) return NextResponse.json({ error: "Invalid origin." }, { status: 403 }); } catch { return NextResponse.json({ error: "Invalid origin." }, { status: 403 }); } }
  const ip = getClientIp(req);
  if (!rateLimit(`analytics:${ip}`, 90, 60_000)) return NextResponse.json({ error: "Too many events." }, { status: 429 });
  let payload: unknown;
  try { payload = await req.json(); } catch { return NextResponse.json({ error: "Invalid event." }, { status: 400 }); }
  const record = (payload ?? {}) as Record<string, unknown>;
  if (typeof record.productId !== "string" || !UUID_RE.test(record.productId) || record.type !== "view") return NextResponse.json({ error: "Invalid event." }, { status: 400 });
  const visitorId = analyticsVisitorId(req);
  const response = NextResponse.json({ accepted: true });
  setAnalyticsCookie(response, visitorId);
  if (isAnalyticsBot(req.headers.get("user-agent"))) return response;
  const admin = createAdminSupabaseClient();
  const { data: product } = await admin.from("products").select("id").eq("id", record.productId).maybeSingle();
  if (!product) return NextResponse.json({ error: "Product not found." }, { status: 404 });
  const day = utcAnalyticsDay();
  await admin.rpc("record_product_analytics", { p_event_id: analyticsPageViewEventId(visitorId, record.productId, Math.floor(Date.now() / 600_000)), p_product_id: record.productId, p_event_type: "view", p_visitor_day_hash: visitorDayHash(visitorId, day), p_day: day });
  return response;
}
