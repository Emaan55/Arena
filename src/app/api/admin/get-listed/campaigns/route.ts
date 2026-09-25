import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { isAuthorizedAdmin } from "@/lib/admin-auth";
import {
  getAnnotatedCampaigns,
  isCampaignSoftDeleteReady,
  type AdminCampaignFulfillmentFilter,
  type AdminCampaignPaymentFilter,
  type AdminCampaignSort,
  type AdminCampaignWorkFilter,
} from "@/lib/get-listed/admin";

const PAGE_SIZE_DEFAULT = 25;
const PAGE_SIZE_MAX = 100;
const CANDIDATE_CAP = 2000;

/**
 * Founder-only: every campaign across every customer, with search,
 * independent payment/fulfillment/package filters, sorting, and
 * server-side pagination — the browser only ever receives one page. The
 * actual filter/sort logic lives in getAnnotatedCampaigns
 * (lib/get-listed/admin.ts), shared with the CSV export route so the two
 * can never disagree about which campaigns match a given search/filter.
 */
export async function GET(req: NextRequest) {
  if (!isAuthorizedAdmin(req)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const url = new URL(req.url);
  const q = url.searchParams.get("q") ?? "";
  const paymentFilter = (url.searchParams.get("payment") ?? "all") as AdminCampaignPaymentFilter;
  const fulfillmentFilter = (url.searchParams.get("fulfillment") ?? "all") as AdminCampaignFulfillmentFilter;
  const packageFilter = url.searchParams.get("package") ?? "all";
  const workFilter = (url.searchParams.get("work") ?? "all") as AdminCampaignWorkFilter;
  const sort = (url.searchParams.get("sort") ?? "newest") as AdminCampaignSort;
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const pageSize = Math.min(PAGE_SIZE_MAX, Math.max(1, Number(url.searchParams.get("pageSize")) || PAGE_SIZE_DEFAULT));

  const admin = createAdminSupabaseClient();
  const softDeleteReady = await isCampaignSoftDeleteReady(admin);

  const { rows: annotated } = await getAnnotatedCampaigns(admin, {
    q,
    payment: paymentFilter,
    fulfillment: fulfillmentFilter,
    packageKey: packageFilter,
    work: workFilter,
    sort,
  });

  // Global (unfiltered by search/payment/package, but always excluding
  // deleted) stats for the overview cards — computed from the full active
  // set, not whatever the current filters/search narrow the table down to.
  let statsCampaignsQuery = admin.from("campaigns").select("status").limit(CANDIDATE_CAP);
  if (softDeleteReady) statsCampaignsQuery = statsCampaignsQuery.is("deleted_at", null);
  const { data: statsCampaigns } = await statsCampaignsQuery;
  const stats = {
    total: statsCampaigns?.length ?? 0,
    awaitingPayment: (statsCampaigns ?? []).filter((c) => c.status === "awaiting_payment").length,
    active: (statsCampaigns ?? []).filter((c) => c.status === "active").length,
    inProgress: (statsCampaigns ?? []).filter((c) => c.status === "in_progress").length,
    completed: (statsCampaigns ?? []).filter((c) => c.status === "completed").length,
  };

  // Submission totals across the same full active set as the stats above
  // (never whatever the current filters narrow the table down to). Reuses
  // `annotated` directly when no filter/search is active instead of paying
  // for a second identical query.
  const wantDeleted = softDeleteReady && fulfillmentFilter === "deleted";
  const noFilterActive = !q && paymentFilter === "all" && fulfillmentFilter === "all" && packageFilter === "all" && workFilter === "all";
  const submissionStats = { total: 0, accepted: 0, pending: 0, rejected: 0 };
  if (!wantDeleted) {
    const allActive = noFilterActive ? annotated : (await getAnnotatedCampaigns(admin, {})).rows;
    for (const c of allActive) {
      submissionStats.total += c.submission_count;
      submissionStats.accepted += c.accepted_count;
      submissionStats.rejected += c.rejected_count;
      submissionStats.pending += c.pending_count;
    }
  }

  const total = annotated.length;
  const start = (page - 1) * pageSize;
  const pageRows = annotated.slice(start, start + pageSize);

  return NextResponse.json({
    campaigns: pageRows,
    total,
    page,
    pageSize,
    stats: { ...stats, submissions: submissionStats },
    softDeleteReady,
  });
}
