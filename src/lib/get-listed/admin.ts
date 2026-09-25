import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Campaign, CampaignStatus, Order, OrderPaymentStatus, Submission } from "@/types/database";
import { isGetListedPackageKey } from "./packages";

type AdminClient = SupabaseClient<Database>;

// A generous ceiling on how many campaigns any admin list/export route
// will ever annotate and sort in one request — see getAnnotatedCampaigns's
// own comment for why this is done in-process rather than as a raw SQL
// aggregate query.
const CANDIDATE_CAP = 2000;

const FULFILLMENT_VALUES: CampaignStatus[] = ["draft", "awaiting_payment", "active", "in_progress", "completed", "cancelled"];
const PAYMENT_VALUES: OrderPaymentStatus[] = ["pending", "paid", "failed", "refunded", "cancelled"];

/**
 * Guards every reference to campaigns.deleted_at/deleted_by (migration
 * 0019). Until that migration is actually run against the database, those
 * columns don't exist — filtering on them would error out the whole admin
 * campaign list, not just soft-delete/restore, so every route that touches
 * them checks this first and degrades to "soft delete isn't available yet"
 * instead of a 500.
 */
export async function isCampaignSoftDeleteReady(admin: AdminClient): Promise<boolean> {
  const { error } = await admin.from("campaigns").select("deleted_at").limit(1);
  return !error;
}

/** "No order at all yet" is its own state, distinct from any real OrderPaymentStatus. */
export type AdminPaymentStatus = OrderPaymentStatus | "no_order";

/**
 * A campaign's payment state is read exclusively from its orders — never
 * from campaigns.status, which only ever describes fulfillment. When a
 * campaign has more than one order (e.g. a failed attempt followed by a
 * successful retry), the most recently updated order is treated as the
 * current payment state.
 */
export function derivePaymentStatus(orders: Pick<Order, "payment_status" | "updated_at">[]): AdminPaymentStatus {
  if (orders.length === 0) return "no_order";
  const latest = [...orders].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())[0];
  return latest.payment_status;
}

export interface SubmissionSummary {
  target: number;
  submitted: number;
  accepted: number;
  pending: number;
  rejected: number;
  remaining: number;
}

/**
 * "Pending" here buckets both `pending` (not yet actioned) and `submitted`
 * (sent to the directory, awaiting a response) — accepted + pending +
 * rejected always sums to the total submitted count. A rejected directory
 * still counts as real submitted work; `remaining` is target minus actual
 * rows recorded, never minus accepted-only.
 */
export function summarizeSubmissions(submissions: Pick<Submission, "status">[], target: number): SubmissionSummary {
  const accepted = submissions.filter((s) => s.status === "accepted").length;
  const rejected = submissions.filter((s) => s.status === "rejected").length;
  const pending = submissions.length - accepted - rejected;
  return {
    target,
    submitted: submissions.length,
    accepted,
    pending,
    rejected,
    remaining: Math.max(0, target - submissions.length),
  };
}

/**
 * Informational only, never a second status system — always recomputed
 * fresh from the same trusted state everything else uses, never stored.
 */
export function computeNextAction(params: {
  fulfillmentStatus: CampaignStatus;
  isDeleted: boolean;
  paymentStatus: AdminPaymentStatus;
  submissionCount: number;
  pendingCount: number;
  target: number;
}): string {
  if (params.isDeleted) return "Deleted";
  if (params.fulfillmentStatus === "cancelled") return "Cancelled";
  if (params.fulfillmentStatus === "completed") return "No action needed";
  if (params.paymentStatus !== "paid") return "Waiting for payment";
  if (params.submissionCount === 0) return "Start submissions";
  if (params.submissionCount < params.target) return "Continue submissions";
  if (params.pendingCount > 0) return "Waiting for directory responses";
  return "Ready to complete";
}

export type AdminCampaignFulfillmentFilter = CampaignStatus | "all" | "deleted";
export type AdminCampaignPaymentFilter = AdminPaymentStatus | "all";
export type AdminCampaignSort = "newest" | "oldest" | "updated" | "progress_high" | "progress_low";

/**
 * A work-queue view over the exact same fields every other filter already
 * uses (payment_status, submission_count/target, pending_count, status) —
 * never a second fulfillment-status system, just a different way of
 * bucketing the one that already exists. "needs_work" is the broadest
 * bucket (paid, not finished, something left to do); the others are more
 * specific slices of it.
 */
export type AdminCampaignWorkFilter =
  | "all"
  | "needs_work"
  | "no_submissions"
  | "target_not_reached"
  | "waiting_responses"
  | "target_reached"
  | "completed";

function matchesWorkFilter(c: AnnotatedCampaign, filter: AdminCampaignWorkFilter): boolean {
  const notFinished = c.status !== "completed" && c.status !== "cancelled";
  switch (filter) {
    case "needs_work":
      return c.payment_status === "paid" && notFinished && (c.submission_count < c.submission_target || c.pending_count > 0);
    case "no_submissions":
      return c.payment_status === "paid" && c.submission_count === 0;
    case "target_not_reached":
      return c.payment_status === "paid" && c.submission_count < c.submission_target;
    case "waiting_responses":
      return c.pending_count > 0;
    case "target_reached":
      return c.submission_target > 0 && c.submission_count >= c.submission_target;
    case "completed":
      return c.status === "completed";
    case "all":
    default:
      return true;
  }
}

export type AnnotatedCampaign = Campaign & {
  owner_email: string | null;
  submission_count: number;
  accepted_count: number;
  pending_count: number;
  rejected_count: number;
  payment_status: AdminPaymentStatus;
  next_action: string;
  provider_order_ids: string[];
};

export interface AnnotatedCampaignsResult {
  rows: AnnotatedCampaign[];
  softDeleteReady: boolean;
}

/**
 * The one place campaign search/filter/sort is computed for the admin
 * side — used by the JSON campaign list route (which paginates the
 * result) and the CSV export route (which doesn't), so "which campaigns
 * match your search and filters" can never disagree between what an admin
 * sees on screen and what they export. Never called for anything
 * customer-facing; see lib/get-listed/report.ts for that side.
 *
 * Filtering/sorting happen in-process over the full (non-deleted, or
 * deleted-only when explicitly asked for) campaign set rather than as raw
 * SQL — the same established pattern this route already used before
 * Phase 2, extended rather than replaced. CANDIDATE_CAP is the backstop if
 * this app's actual scale (a founder's own manual-fulfillment dataset)
 * ever stops holding.
 */
export async function getAnnotatedCampaigns(
  admin: AdminClient,
  params: {
    q?: string;
    payment?: AdminCampaignPaymentFilter;
    fulfillment?: AdminCampaignFulfillmentFilter;
    packageKey?: string;
    work?: AdminCampaignWorkFilter;
    sort?: AdminCampaignSort;
  },
): Promise<AnnotatedCampaignsResult> {
  const q = (params.q ?? "").trim();
  const paymentFilter = params.payment ?? "all";
  const fulfillmentFilter = params.fulfillment ?? "all";
  const packageFilter = params.packageKey ?? "all";
  const workFilter = params.work ?? "all";
  const sort = params.sort ?? "newest";

  const softDeleteReady = await isCampaignSoftDeleteReady(admin);
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

  const { data: campaigns } = fulfillmentFilter === "deleted" && !softDeleteReady ? { data: [] as Campaign[] } : await campaignsQuery;
  const allCampaigns = campaigns ?? [];

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

  const { data: usersPage } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const emailById = new Map((usersPage?.users ?? []).map((u) => [u.id, u.email ?? null]));

  const qLower = q.toLowerCase();
  let annotated: AnnotatedCampaign[] = allCampaigns.map((c) => {
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

  if (workFilter !== "all") {
    annotated = annotated.filter((c) => matchesWorkFilter(c, workFilter));
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

  return { rows: annotated, softDeleteReady };
}
