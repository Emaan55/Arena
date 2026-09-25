import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createRouteHandlerSupabaseClient } from "@/lib/supabase/server";
import { getCustomerCampaignReport } from "@/lib/get-listed/report";

/**
 * Ownership is enforced by filtering on campaign_id AND owner_id in the
 * SAME query — never "fetch by id, then compare owner_id in code" — so
 * there's no code path where a row briefly exists in memory before an
 * ownership check runs. A row that exists but belongs to someone else
 * looks identical to one that doesn't exist at all (plain 404). A
 * soft-deleted campaign (Phase 1 admin) is treated the same way: never
 * exposed to the customer, regardless of who owns it.
 *
 * The report data itself comes entirely from getCustomerCampaignReport()
 * (lib/get-listed/report.ts) — the same function the admin report preview
 * and CSV export use, so progress/acceptance-rate math can never drift
 * between them.
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
    .select("id")
    .eq("id", id)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
  }

  const report = await getCustomerCampaignReport(admin, id);
  if (!report || report.campaign.isDeleted) {
    return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
  }

  return NextResponse.json({ report });
}
