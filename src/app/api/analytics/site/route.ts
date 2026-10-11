import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { getClientIp } from "@/lib/fingerprint";
import { rateLimit } from "@/lib/rate-limit";
import { analyticsVisitorHash, analyticsVisitorId, isAnalyticsBot, setAnalyticsCookie } from "@/lib/product-analytics";

export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (origin) {
    try { if (new URL(origin).host !== req.headers.get("host")) return NextResponse.json({ error: "Invalid origin." }, { status: 403 }); }
    catch { return NextResponse.json({ error: "Invalid origin." }, { status: 403 }); }
  }
  const ip = getClientIp(req);
  if (!rateLimit(`site-analytics:${ip}`, 30, 60_000)) return NextResponse.json({ error: "Too many events." }, { status: 429 });

  const visitorId = analyticsVisitorId(req);
  const response = NextResponse.json({ accepted: true });
  setAnalyticsCookie(response, visitorId);
  if (isAnalyticsBot(req.headers.get("user-agent"))) return response;

  try {
    await createAdminSupabaseClient().rpc("record_arena_site_visit", { p_visitor_hash: analyticsVisitorHash(visitorId) });
  } catch {
    // Analytics never blocks page use. A missing migration simply leaves the
    // public visitor count unavailable until setup is completed.
  }
  return response;
}

