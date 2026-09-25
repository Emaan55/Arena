import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { isAuthorizedAdmin } from "@/lib/admin-auth";
import {
  getAnnotatedCampaigns,
  type AdminCampaignFulfillmentFilter,
  type AdminCampaignPaymentFilter,
  type AdminCampaignSort,
  type AdminCampaignWorkFilter,
} from "@/lib/get-listed/admin";
import { GET_LISTED_PACKAGES, type GetListedPackageKey } from "@/lib/get-listed/packages";
import { toCsv, csvResponse } from "@/lib/csv";

/**
 * One row per campaign, applying the exact same search/filter (and sort,
 * for a stable row order) as the admin campaign list — via the shared
 * getAnnotatedCampaigns (lib/get-listed/admin.ts), never a second,
 * separately-maintained filter implementation. "Export current results"
 * on the list page hits this with the same query params it's currently
 * showing.
 */
export async function GET(req: NextRequest) {
  if (!isAuthorizedAdmin(req)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const url = new URL(req.url);
  const admin = createAdminSupabaseClient();

  const { rows } = await getAnnotatedCampaigns(admin, {
    q: url.searchParams.get("q") ?? "",
    payment: (url.searchParams.get("payment") ?? "all") as AdminCampaignPaymentFilter,
    fulfillment: (url.searchParams.get("fulfillment") ?? "all") as AdminCampaignFulfillmentFilter,
    packageKey: url.searchParams.get("package") ?? "all",
    work: (url.searchParams.get("work") ?? "all") as AdminCampaignWorkFilter,
    sort: (url.searchParams.get("sort") ?? "newest") as AdminCampaignSort,
  });

  const headers = [
    "campaign_id",
    "startup_name",
    "website_url",
    "package",
    "submission_target",
    "actual_submissions",
    "accepted",
    "pending",
    "rejected",
    "remaining",
    "fulfillment_status",
    "payment_status",
    "created_at",
    "updated_at",
  ];
  const csvRows = rows.map((c) => [
    c.id,
    c.startup_name,
    c.website_url,
    GET_LISTED_PACKAGES[c.package_key as GetListedPackageKey]?.label ?? c.package_key,
    c.submission_target,
    c.submission_count,
    c.accepted_count,
    c.pending_count,
    c.rejected_count,
    Math.max(0, c.submission_target - c.submission_count),
    c.status,
    c.payment_status,
    c.created_at,
    c.updated_at,
  ]);

  const csv = toCsv(headers, csvRows);
  return csvResponse(`get-listed-campaigns-${new Date().toISOString().slice(0, 10)}.csv`, csv);
}
