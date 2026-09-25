import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, CampaignStatus, Order, OrderPaymentStatus, Submission } from "@/types/database";

type AdminClient = SupabaseClient<Database>;

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
