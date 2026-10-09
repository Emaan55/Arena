import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { getClientIp } from "@/lib/fingerprint";
import { rateLimit } from "@/lib/rate-limit";
import { analyticsClickEventId, analyticsVisitorId, isAnalyticsBot, setAnalyticsCookie, utcAnalyticsDay, visitorDayHash } from "@/lib/product-analytics";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Invalid product." }, { status: 400 });
  const admin = createAdminSupabaseClient();
  const { data: product } = await admin.from("products").select("url").eq("id", id).maybeSingle();
  if (!product) return NextResponse.json({ error: "Product not found." }, { status: 404 });
  let destination: URL;
  try { destination = new URL(product.url); if (!["https:", "http:"].includes(destination.protocol)) throw new Error(); }
  catch { return NextResponse.json({ error: "Product website is unavailable." }, { status: 400 }); }
  const visitorId = analyticsVisitorId(req);
  const response = NextResponse.redirect(destination, 302);
  setAnalyticsCookie(response, visitorId);
  if (!isAnalyticsBot(req.headers.get("user-agent")) && rateLimit(`analytics-click:${getClientIp(req)}`, 60, 60_000)) {
    const day = utcAnalyticsDay();
    await admin.rpc("record_product_analytics", { p_event_id: analyticsClickEventId(visitorId, id, Math.floor(Date.now() / 30_000)), p_product_id: id, p_event_type: "click", p_visitor_day_hash: visitorDayHash(visitorId, day), p_day: day });
  }
  return response;
}
