import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { getClientIp } from "@/lib/fingerprint";
import { rateLimit } from "@/lib/rate-limit";
import { toSearchPattern } from "@/lib/search";

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

  const { data, error } = await admin
    .from("products")
    .select("id,name,category,pitch,battle_pitch,status,wins,x_handle")
    .or(
      `name.ilike.${pattern},pitch.ilike.${pattern},category.ilike.${pattern},x_handle.ilike.${pattern}`,
    )
    .order("wins", { ascending: false })
    .limit(RESULT_LIMIT);

  if (error) {
    return NextResponse.json({ error: "Search failed. Please try again." }, { status: 500 });
  }

  return NextResponse.json({ results: data ?? [] });
}
