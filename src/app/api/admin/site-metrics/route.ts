import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedAdmin } from "@/lib/admin-auth";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { getArenaPublicMetrics } from "@/lib/site-metrics";

const TEXT_MAX = 100;
const URL_MAX = 500;

export async function GET(req: NextRequest) {
  if (!isAuthorizedAdmin(req)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const metrics = await getArenaPublicMetrics(createAdminSupabaseClient());
  return NextResponse.json({ metrics });
}

export async function PATCH(req: NextRequest) {
  if (!isAuthorizedAdmin(req)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  let payload: unknown;
  try { payload = await req.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  const record = (payload ?? {}) as Record<string, unknown>;
  const domainRating = Number(record.domainRating);
  const source = typeof record.source === "string" ? record.source.trim() : "";
  const sourceUrl = typeof record.sourceUrl === "string" ? record.sourceUrl.trim() : "";
  if (!Number.isFinite(domainRating) || domainRating < 0 || domainRating > 100) return NextResponse.json({ error: "Domain rating must be between 0 and 100." }, { status: 400 });
  if (!source || source.length > TEXT_MAX) return NextResponse.json({ error: "Add the SEO provider used to verify this score." }, { status: 400 });
  if (!sourceUrl || sourceUrl.length > URL_MAX) return NextResponse.json({ error: "Add the verification source URL." }, { status: 400 });
  try { const url = new URL(sourceUrl); if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error(); }
  catch { return NextResponse.json({ error: "Verification source must be a valid HTTP or HTTPS URL." }, { status: 400 }); }

  const admin = createAdminSupabaseClient();
  const { error } = await admin.from("arena_public_metrics").upsert({
    id: true,
    domain_rating: domainRating,
    domain_rating_source: source,
    domain_rating_source_url: sourceUrl,
    domain_rating_checked_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: "id" });
  if (error) return NextResponse.json({ error: "Could not save site metrics. Apply migration 0028 first." }, { status: 500 });
  return NextResponse.json({ metrics: await getArenaPublicMetrics(admin) });
}

