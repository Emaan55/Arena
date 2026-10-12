import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedAdmin } from "@/lib/admin-auth";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export async function GET(req: NextRequest) {
  if (!isAuthorizedAdmin(req)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const admin = createAdminSupabaseClient();
  const [{ data: campaigns, error: campaignError }, { data: results, error: resultError }] = await Promise.all([
    admin
      .from("campaigns")
      .select("id,startup_name,website_url,package_label,campaign_duration_days,status,updated_at")
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(500),
    admin
      .from("campaign_results")
      .select("id,campaign_id,is_published,updated_at,published_at,domain_rating")
      .order("updated_at", { ascending: false })
      .limit(500),
  ]);

  if (campaignError) return NextResponse.json({ error: "Could not load campaigns." }, { status: 500 });
  if (resultError) {
    return NextResponse.json({ error: "Campaign Results is not ready. Apply migration 0029 first." }, { status: 503 });
  }

  const resultByCampaign = new Map((results ?? []).map((result) => [result.campaign_id, result]));
  return NextResponse.json({
    campaigns: (campaigns ?? []).map((campaign) => ({
      ...campaign,
      result: resultByCampaign.get(campaign.id) ?? null,
    })),
  });
}
