import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { isAuthorizedAdmin } from "@/lib/admin-auth";
import { getAnnotatedCampaigns } from "@/lib/get-listed/admin";
import { GET_LISTED_PACKAGES, type GetListedPackageKey } from "@/lib/get-listed/packages";

type DateFilter = "today" | "7d" | "30d" | "all";

// All cutoffs computed in UTC, consistently — every timestamp in this
// database is already stored as timestamptz (UTC), so "today" here means
// the current UTC day, not the admin's local day. Never silently mixed
// with a local-time cutoff anywhere in this route.
function sinceDate(filter: DateFilter): Date | null {
  if (filter === "all") return null;
  const now = new Date();
  if (filter === "today") return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const days = filter === "7d" ? 7 : 30;
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

/**
 * Lightweight, not a general analytics platform — campaign/fulfillment
 * counts reuse getAnnotatedCampaigns (lib/get-listed/admin.ts, the same
 * function the campaign list and CSV export use, so these numbers can
 * never disagree with what the list page shows), and revenue is a direct
 * query against `orders` filtered to payment_status = 'paid' only —
 * pending/failed/cancelled/refunded orders never count as revenue.
 *
 * `since` filters campaign/fulfillment metrics by campaign creation date
 * and revenue by the order's paid_at — two different, both legitimate,
 * date dimensions ("campaigns created in this window" vs. "revenue
 * recognized in this window"), never conflated with each other.
 */
export async function GET(req: NextRequest) {
  if (!isAuthorizedAdmin(req)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const url = new URL(req.url);
  const since = (url.searchParams.get("since") ?? "all") as DateFilter;
  const sinceAt = sinceDate(since);

  const admin = createAdminSupabaseClient();
  const { rows: allRows } = await getAnnotatedCampaigns(admin, {});
  const rows = sinceAt ? allRows.filter((c) => new Date(c.created_at) >= sinceAt) : allRows;

  const campaigns = {
    total: rows.length,
    paid: rows.filter((c) => c.payment_status === "paid").length,
    active: rows.filter((c) => c.status === "active").length,
    inProgress: rows.filter((c) => c.status === "in_progress").length,
    completed: rows.filter((c) => c.status === "completed").length,
    awaitingPayment: rows.filter((c) => c.status === "awaiting_payment").length,
  };

  const fulfillment = {
    totalSubmissions: sum(rows.map((c) => c.submission_count)),
    accepted: sum(rows.map((c) => c.accepted_count)),
    pending: sum(rows.map((c) => c.pending_count)),
    rejected: sum(rows.map((c) => c.rejected_count)),
  };

  const packageBreakdown = Object.keys(GET_LISTED_PACKAGES).map((key) => ({
    packageKey: key,
    label: GET_LISTED_PACKAGES[key as GetListedPackageKey].label,
    campaigns: rows.filter((c) => c.package_key === key).length,
  }));

  let ordersQuery = admin.from("orders").select("final_amount, currency, paid_at").eq("payment_status", "paid");
  if (sinceAt) ordersQuery = ordersQuery.gte("paid_at", sinceAt.toISOString());
  const { data: paidOrders } = await ordersQuery;
  const currencies = new Set((paidOrders ?? []).map((o) => o.currency));
  const revenue = {
    totalCents: sum((paidOrders ?? []).map((o) => o.final_amount)),
    orderCount: paidOrders?.length ?? 0,
    // Never falsely combined into one total if more than one currency is
    // actually present — this app only ever charges USD today, but this
    // stays honest if that ever changes rather than silently mislabeling.
    currency: currencies.size === 1 ? [...currencies][0] : currencies.size === 0 ? "USD" : "MIXED",
  };

  const fulfillmentMetrics = {
    avgSubmissionsPerCampaign: rows.length > 0 ? Math.round((fulfillment.totalSubmissions / rows.length) * 10) / 10 : 0,
    campaignsRequiringWork: rows.filter(
      (c) => c.payment_status === "paid" && c.status !== "completed" && c.status !== "cancelled" && c.submission_count < c.submission_target,
    ).length,
    campaignsAtTarget: rows.filter((c) => c.submission_target > 0 && c.submission_count >= c.submission_target).length,
    campaignsAwaitingResponses: rows.filter((c) => c.pending_count > 0).length,
  };

  return NextResponse.json({ since, campaigns, fulfillment, packageBreakdown, revenue, fulfillmentMetrics });
}
