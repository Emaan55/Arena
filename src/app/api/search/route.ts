import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { getClientIp } from "@/lib/fingerprint";
import { rateLimit } from "@/lib/rate-limit";
import { toSearchPattern } from "@/lib/search";
import { isProductFaviconColumnReady } from "@/lib/arena";

const MAX_QUERY_LEN = 80;
const RESULT_LIMIT = 20;

export async function GET(req: NextRequest) {
  const ip = getClientIp(req);
  if (!rateLimit(`search:${ip}`, 60, 60 * 1000)) {
    return NextResponse.json({ error: "Slow down — too many searches." }, { status: 429 });
  }

  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, MAX_QUERY_LEN);
  if (!q) {
    return NextResponse.json({ results: [] });
  }

  const pattern = toSearchPattern(q);
  const admin = createAdminSupabaseClient();

  // An explicit column list (unlike select("*")) fails outright if a named
  // column doesn't exist yet — guard so search still works before
  // migration 0011 has been run, same reasoning as isProductFaviconColumnReady's
  // other call sites.
  const faviconReady = await isProductFaviconColumnReady(admin);
  const columns = `id,name,category,pitch,battle_pitch,status,wins,x_handle${faviconReady ? ",logo_url" : ""}`;

  const { data, error } = await admin
    .from("products")
    .select(columns)
    .or(
      `name.ilike.${pattern},pitch.ilike.${pattern},category.ilike.${pattern},x_handle.ilike.${pattern}`,
    )
    .order("wins", { ascending: false })
    .limit(RESULT_LIMIT);

  if (error) {
    return NextResponse.json({ error: "Search failed. Please try again." }, { status: 500 });
  }

  const results = (data ?? []).map((row) => {
    const r = row as unknown as Record<string, unknown>;
    return { ...r, logo_url: faviconReady ? ((r.logo_url as string | null | undefined) ?? null) : null };
  });

  return NextResponse.json({ results });
}
