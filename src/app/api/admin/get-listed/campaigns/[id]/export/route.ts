import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { isAuthorizedAdmin } from "@/lib/admin-auth";
import { GET_LISTED_PACKAGES, type GetListedPackageKey } from "@/lib/get-listed/packages";
import { toCsv, csvResponse } from "@/lib/csv";

/**
 * One row per actual submission row for this campaign — admin-only, so
 * internal notes are included (this is explicitly an internal export, not
 * anything ever handed to the customer). No payment secrets, tokens, or
 * auth information: only what's already shown on the admin campaign
 * detail page in some form.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAuthorizedAdmin(req)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const { id } = await params;

  const admin = createAdminSupabaseClient();
  const { data: campaign } = await admin.from("campaigns").select("*").eq("id", id).maybeSingle();
  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
  }

  const { data: submissions } = await admin
    .from("submissions")
    .select("*")
    .eq("campaign_id", id)
    .order("created_at", { ascending: true });

  const pkg = GET_LISTED_PACKAGES[campaign.package_key as GetListedPackageKey];
  const headers = [
    "campaign_id",
    "startup_name",
    "website_url",
    "package",
    "submission_target",
    "directory_name",
    "directory_url",
    "submission_status",
    "listing_url",
    "submitted_at",
    "notes",
  ];
  const rows = (submissions ?? []).map((s) => [
    campaign.id,
    campaign.startup_name,
    campaign.website_url,
    pkg?.label ?? campaign.package_key,
    campaign.submission_target,
    s.directory_name,
    s.directory_url,
    s.status,
    s.listing_url,
    s.submitted_at,
    s.notes,
  ]);

  const csv = toCsv(headers, rows);
  const filename = `${campaign.startup_name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-submissions.csv`;
  return csvResponse(filename, csv);
}
