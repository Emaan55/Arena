import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { isAuthorizedAdmin } from "@/lib/admin-auth";
import { isGetListedPackageKey } from "@/lib/get-listed/packages";
import {
  derivePaymentStatus,
  computeNextAction,
  isCampaignSoftDeleteReady,
  type AdminCampaignFulfillmentFilter,
  type AdminCampaignPaymentFilter,
  type AdminCampaignSort,
} from "@/lib/get-listed/admin";
import type { CampaignStatus, Order, OrderPaymentStatus } from "@/types/database";

const PAGE_SIZE_DEFAULT = 25;
const PAGE_SIZE_MAX = 100;
// A generous ceiling on how many campaigns this route will ever annotate
// and sort in one request — see the route-level comment below for why this
// is done in-process rather than as a raw SQL aggregate query.
const CANDIDATE_CAP = 2000;

const FULFILLMENT_VALUES: CampaignStatus[] = ["draft", "awaiting_payment", "active", "in_progress", "completed", "cancelled"];
const PAYMENT_VALUES: OrderPaymentStatus[] = ["pending", "paid", "failed", "refunded", "cancelled"];

/**
 * Founder-only: every campaign across every customer, with search,
 * independent payment/fulfillment/package filters, sorting, and
 * server-side pagination — the browser only ever receives one page.
 *
 * Filtering/sorting/pagination all happen here, in-process, over the full
 * (non-deleted, or deleted-only when explicitly asked for) campaign set
 * rather than as raw SQL — this is the same pattern the pre-existing
 * version of this route already used (fetch campaigns, fetch submissions
 * for those ids, count in JS, fetch users, map emails), just extended.
 * For this app's actual scale (a founder's own manual-fulfillment
 * dataset, not a public/user-facing table) that's the honest tradeoff:
 * it reuses the codebase's one established data-access pattern instead of
 * introducing a second one (raw SQL aggregates / a Postgres RPC) that
 * nothing else here does. The CANDIDATE_CAP below is the backstop if that
 * assumption ever stops holding — a future phase would need real DB-side
 * aggregation past that point, not more of this.
 */
export async function GET(req: NextRequest) {
  if (!isAuthorizedAdmin(req)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const paymentFilter = (url.searchParams.get("payment") ?? "all") as AdminCampaignPaymentFilter;
  const fulfillmentFilter = (url.searchParams.get("fulfillment") ?? "all") as AdminCampaignFulfillmentFilter;
  const packageFilter = url.searchParams.get("package") ?? "all";
  const sort = (url.searchParams.get("sort") ?? "newest") as AdminCampaignSort;
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const pageSize = Math.min(PAGE_SIZE_MAX, Math.max(1, Number(url.searchParams.get("pageSize")) || PAGE_SIZE_DEFAULT));

  const admin = createAdminSupabaseClient();
  const softDeleteReady = await isCampaignSoftDeleteReady(admin);
  // If migration 0019 hasn't been applied yet, deleted_at doesn't exist as
  // a column at all — filtering on it would error the whole list, so this
  // degrades to "every campaign is treated as active" instead, and the
  // "Deleted" filter simply returns nothing rather than a 500.
  const wantDeleted = softDeleteReady && fulfillmentFilter === "deleted";

  let campaignsQuery = admin.from("campaigns").select("*").limit(CANDIDATE_CAP);
  if (softDeleteReady) {
    campaignsQuery = wantDeleted ? campaignsQuery.not("deleted_at", "is", null) : campaignsQuery.is("deleted_at", null);
  }
  if (!wantDeleted && fulfillmentFilter !== "all" && FULFILLMENT_VALUES.includes(fulfillmentFilter as CampaignStatus)) {
    campaignsQuery = campaignsQuery.eq("status", fulfillmentFilter as CampaignStatus);
  }
  if (packageFilter !== "all" && isGetListedPackageKey(packageFilter)) {
    campaignsQuery = campaignsQuery.eq("package_key", packageFilter);
  }

  const { data: campaigns } = fulfillmentFilter === "deleted" && !softDeleteReady ? { data: [] } : await campaignsQuery;
  const allCampaigns = campaigns ?? [];

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

  const ids = allCampaigns.map((c) => c.id);
  const submissionsByCampaign = new Map<string, { status: string }[]>();
  const ordersByCampaign = new Map<string, Order[]>();

  if (ids.length > 0) {
    const [{ data: submissionRows }, { data: orderRows }] = await Promise.all([
      admin.from("submissions").select("campaign_id, status").in("campaign_id", ids),
      admin.from("orders").select("*").in("campaign_id", ids),
    ]);
    for (const row of submissionRows ?? []) {
      const list = submissionsByCampaign.get(row.campaign_id) ?? [];
      list.push({ status: row.status });
      submissionsByCampaign.set(row.campaign_id, list);
    }
    for (const row of orderRows ?? []) {
      const list = ordersByCampaign.get(row.campaign_id) ?? [];
      list.push(row);
      ordersByCampaign.set(row.campaign_id, list);
    }
  }

  // Submission totals across the currently-visible (deleted-excluded)
  // campaign set — shown alongside the campaign-count stat cards.
  const submissionStats = { total: 0, accepted: 0, pending: 0, rejected: 0 };
  if (!wantDeleted) {
    for (const list of submissionsByCampaign.values()) {
      submissionStats.total += list.length;
      submissionStats.accepted += list.filter((s) => s.status === "accepted").length;
      submissionStats.rejected += list.filter((s) => s.status === "rejected").length;
    }
    submissionStats.pending = submissionStats.total - submissionStats.accepted - submissionStats.rejected;
  }

  const { data: usersPage } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const emailById = new Map((usersPage?.users ?? []).map((u) => [u.id, u.email ?? null]));

  const qLower = q.toLowerCase();
  let annotated = allCampaigns.map((c) => {
    const submissions = submissionsByCampaign.get(c.id) ?? [];
    const orders = ordersByCampaign.get(c.id) ?? [];
    const accepted = submissions.filter((s) => s.status === "accepted").length;
    const rejected = submissions.filter((s) => s.status === "rejected").length;
    const pending = submissions.length - accepted - rejected;
    const paymentStatus = derivePaymentStatus(orders);
    const ownerEmail = emailById.get(c.owner_id) ?? null;
    return {
      ...c,
      owner_email: ownerEmail,
      submission_count: submissions.length,
      accepted_count: accepted,
      pending_count: pending,
      rejected_count: rejected,
      payment_status: paymentStatus,
      next_action: computeNextAction({
        fulfillmentStatus: c.status,
        isDeleted: Boolean(c.deleted_at),
        paymentStatus,
        submissionCount: submissions.length,
        pendingCount: pending,
        target: c.submission_target,
      }),
      provider_order_ids: orders.map((o) => o.provider_order_id).filter((v): v is string => !!v),
    };
  });

  if (paymentFilter !== "all" && (paymentFilter === "no_order" || PAYMENT_VALUES.includes(paymentFilter as OrderPaymentStatus))) {
    annotated = annotated.filter((c) => c.payment_status === paymentFilter);
  }

  if (qLower) {
    annotated = annotated.filter(
      (c) =>
        c.id === q.trim() ||
        c.startup_name.toLowerCase().includes(qLower) ||
        c.website_url.toLowerCase().includes(qLower) ||
        (c.owner_email ?? "").toLowerCase().includes(qLower) ||
        c.provider_order_ids.some((id) => id.toLowerCase().includes(qLower)),
    );
  }

  annotated.sort((a, b) => {
    switch (sort) {
      case "oldest":
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      case "updated":
        return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
      case "progress_high":
        return b.submission_count / b.submission_target - a.submission_count / a.submission_target;
      case "progress_low":
        return a.submission_count / a.submission_target - b.submission_count / b.submission_target;
      case "newest":
      default:
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    }
  });

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
