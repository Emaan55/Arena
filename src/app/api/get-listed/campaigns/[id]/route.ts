import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createRouteHandlerSupabaseClient } from "@/lib/supabase/server";

/**
 * Ownership is enforced by filtering on campaign_id AND owner_id in the
 * SAME query — never "fetch by id, then compare owner_id in code" — so
 * there's no code path where a row briefly exists in memory before an
 * ownership check runs. A row that exists but belongs to someone else
 * looks identical to one that doesn't exist at all (plain 404).
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const supabaseAuth = await createRouteHandlerSupabaseClient();
  const {
    data: { user },
  } = await supabaseAuth.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in to view this campaign." }, { status: 401 });
  }

  const admin = createAdminSupabaseClient();
  const { data: campaign } = await admin
    .from("campaigns")
    .select("*")
    .eq("id", id)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
  }

  const { data: submissions } = await admin
    .from("submissions")
    .select("*")
    .eq("campaign_id", campaign.id)
    .order("created_at", { ascending: true });

  // Most recent order (if the orders table exists yet — see migration
  // 0018) so the client can tell "never started checkout" apart from
  // "checkout started, still awaiting the webhook" without guessing from
  // campaign.status alone.
  const { data: order } = await admin
    .from("orders")
    .select("*")
    .eq("campaign_id", campaign.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return NextResponse.json({ campaign, submissions: submissions ?? [], order: order ?? null });
}
