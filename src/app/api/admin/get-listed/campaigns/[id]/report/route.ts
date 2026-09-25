import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { isAuthorizedAdmin } from "@/lib/admin-auth";
import { getCustomerCampaignReport } from "@/lib/get-listed/report";

/**
 * Returns EXACTLY the same shape the customer's own report route returns
 * (see getCustomerCampaignReport in lib/get-listed/report.ts) — "preview
 * exactly what the customer sees" only means something if this is the same
 * data structure, not a superset of it. Internal-only information (admin
 * identifiers, notes, raw audit metadata, payment provider ids) never
 * reaches this response; that stays on the existing admin campaign detail
 * page, which is a deliberately separate view.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAuthorizedAdmin(req)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const { id } = await params;

  const admin = createAdminSupabaseClient();
  const report = await getCustomerCampaignReport(admin, id);
  if (!report) {
    return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
  }

  return NextResponse.json({ report });
}
