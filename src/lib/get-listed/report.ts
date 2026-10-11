import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, AdminAuditLog, Campaign, CampaignDeliverable, Submission, SubmissionStatus } from "@/types/database";
import { GET_LISTED_PACKAGES, type GetListedPackageKey } from "./packages";
import { derivePaymentStatus, summarizeSubmissions, type AdminPaymentStatus } from "./admin";

type AdminClient = SupabaseClient<Database>;

export interface ReportSubmission {
  id: string;
  directoryName: string;
  directoryUrl: string | null;
  listingUrl: string | null;
  status: SubmissionStatus;
  submittedAt: string | null;
}

export interface ReportTimelineEntry {
  id: string;
  date: string;
  label: string;
}

export type ReportDeliverable = Pick<
  CampaignDeliverable,
  "id" | "kind" | "title" | "purpose" | "status" | "public_url" | "asset_url" | "customer_notes" | "metrics" | "completed_at"
>;

/**
 * The one shape both the customer report page and the admin report
 * preview render (via the shared CampaignReport component) — this IS the
 * customer-safe view. No admin identifiers, no raw audit metadata, no
 * internal submission notes, no payment provider ids. The admin campaign
 * detail page (Phase 1) already shows the fuller internal picture
 * separately; this type is never extended with more fields for admin use,
 * on purpose, because "preview exactly what the customer sees" only means
 * something if it's exactly the same data structure.
 */
export interface CustomerCampaignReport {
  campaign: {
    id: string;
    startupName: string;
    websiteUrl: string;
    packageKey: string;
    packageLabel: string;
    packagePriceUsd: number | null;
    discountPercent: number | null;
    submissionTarget: number;
    durationDays: number | null;
    status: Campaign["status"];
    createdAt: string;
    updatedAt: string;
    isDeleted: boolean;
  };
  payment: {
    status: AdminPaymentStatus;
    amountCents: number | null;
    currency: string;
  };
  progress: {
    target: number;
    submitted: number;
    accepted: number;
    pending: number;
    rejected: number;
    remaining: number;
    progressPercent: number | null;
    acceptanceRate: number | null;
  };
  accepted: ReportSubmission[];
  pending: ReportSubmission[];
  rejected: ReportSubmission[];
  deliverables: ReportDeliverable[];
  timeline: ReportTimelineEntry[];
}

function toReportSubmission(s: Submission): ReportSubmission {
  return {
    id: s.id,
    directoryName: s.directory_name,
    directoryUrl: s.directory_url,
    listingUrl: s.listing_url,
    status: s.status,
    submittedAt: s.submitted_at,
  };
}

/**
 * Built from the exact same admin_audit_logs rows Phase 1 already writes
 * (lib/get-listed/audit.ts) — never a second activity system. Only a
 * deliberate allowlist of actions ever reaches this timeline; campaign
 * edits, deletes, admin identifiers, and raw metadata never do.
 */
function buildCustomerTimeline(campaign: Campaign, auditLog: AdminAuditLog[]): ReportTimelineEntry[] {
  const entries: ReportTimelineEntry[] = [{ id: "created", date: campaign.created_at, label: "Campaign created" }];

  for (const entry of auditLog) {
    const meta = (entry.metadata ?? {}) as Record<string, unknown>;
    const directory = typeof meta.directory === "string" ? meta.directory : null;

    if (entry.action === "payment_received" || entry.action === "payment_reconciled") {
      entries.push({ id: entry.id, date: entry.created_at, label: "Payment received" });
    } else if (entry.action === "status_changed") {
      if (meta.to === "active") entries.push({ id: entry.id, date: entry.created_at, label: "Campaign activated" });
      else if (meta.to === "in_progress") entries.push({ id: entry.id, date: entry.created_at, label: "Campaign marked in progress" });
      else if (meta.to === "completed") entries.push({ id: entry.id, date: entry.created_at, label: "Submission target completed" });
    } else if (entry.action === "submission_added" && directory) {
      entries.push({ id: entry.id, date: entry.created_at, label: `${directory} submitted` });
    } else if (entry.action === "submission_status_changed" && directory) {
      if (meta.to_status === "accepted") entries.push({ id: entry.id, date: entry.created_at, label: `${directory} accepted` });
      else if (meta.to_status === "rejected") entries.push({ id: entry.id, date: entry.created_at, label: `${directory} not accepted` });
      else if (meta.to_status === "submitted") entries.push({ id: entry.id, date: entry.created_at, label: `${directory} submitted` });
    } else if (entry.action === "deliverable_updated" && typeof meta.title === "string") {
      if (meta.to_status === "completed") entries.push({ id: entry.id, date: entry.created_at, label: `${meta.title} completed` });
      else if (meta.to_status === "in_progress") entries.push({ id: entry.id, date: entry.created_at, label: `${meta.title} started` });
    }
  }

  return entries.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

/**
 * The single place campaign report data is calculated — used by the
 * customer report page, the admin report preview, and CSV export, so
 * progress/acceptance-rate math can never drift between them (see the
 * Phase 2 spec's "no duplicate business logic" rule). Reuses Phase 1's
 * summarizeSubmissions/derivePaymentStatus rather than recomputing
 * anything from scratch. Returns null for a campaign that doesn't exist;
 * callers decide what a 404 vs. an admin "not found" looks like.
 */
export async function getCustomerCampaignReport(admin: AdminClient, campaignId: string, authorizedCampaign?: Campaign): Promise<CustomerCampaignReport | null> {
  const campaign = authorizedCampaign ?? (await admin.from("campaigns").select("*").eq("id", campaignId).maybeSingle()).data;
  if (!campaign) return null;

  const [{ data: submissionRows }, { data: orderRows }, { data: deliverableRows }, { data: auditRows }] = await Promise.all([
    admin.from("submissions").select("*").eq("campaign_id", campaignId).order("created_at", { ascending: true }),
    admin.from("orders").select("*").eq("campaign_id", campaignId).order("created_at", { ascending: false }),
    admin.from("campaign_deliverables").select("*").eq("campaign_id", campaignId).order("position", { ascending: true }),
    admin.from("admin_audit_logs").select("*").eq("campaign_id", campaignId).order("created_at", { ascending: true }),
  ]);
  const submissions = submissionRows ?? [];
  const orders = orderRows ?? [];
  const auditLog: AdminAuditLog[] = auditRows ?? [];

  const summary = summarizeSubmissions(submissions, campaign.submission_target);
  const paymentStatus = derivePaymentStatus(orders);
  // Prefer the paid order's actual charged amount (a historical snapshot,
  // see migration 0018) over recomputing from current package config —
  // pricing/discounts can change after the fact, this campaign already
  // paid whatever it paid.
  const relevantOrder = orders.find((o) => o.payment_status === "paid") ?? orders[0] ?? null;
  const pkg = GET_LISTED_PACKAGES[campaign.package_key as GetListedPackageKey];

  const resolvedCount = summary.accepted + summary.rejected;
  const acceptanceRate = resolvedCount > 0 ? Math.round((summary.accepted / resolvedCount) * 1000) / 10 : null;
  const progressPercent = summary.target > 0 ? Math.round((summary.submitted / summary.target) * 100) : null;

  return {
    campaign: {
      id: campaign.id,
      startupName: campaign.startup_name,
      websiteUrl: campaign.website_url,
      packageKey: campaign.package_key,
      packageLabel: campaign.package_label || pkg?.label || campaign.package_key,
      packagePriceUsd: pkg?.priceUsd ?? null,
      discountPercent: campaign.discount_percent,
      submissionTarget: campaign.submission_target,
      durationDays: campaign.campaign_duration_days,
      status: campaign.status,
      createdAt: campaign.created_at,
      updatedAt: campaign.updated_at,
      isDeleted: Boolean(campaign.deleted_at),
    },
    payment: {
      status: paymentStatus,
      amountCents: relevantOrder?.final_amount ?? null,
      currency: relevantOrder?.currency ?? "USD",
    },
    progress: {
      target: summary.target,
      submitted: summary.submitted,
      accepted: summary.accepted,
      pending: summary.pending,
      rejected: summary.rejected,
      remaining: summary.remaining,
      progressPercent,
      acceptanceRate,
    },
    accepted: submissions.filter((s) => s.status === "accepted").map(toReportSubmission),
    pending: submissions.filter((s) => s.status === "pending" || s.status === "submitted").map(toReportSubmission),
    rejected: submissions.filter((s) => s.status === "rejected").map(toReportSubmission),
    deliverables: (deliverableRows ?? []).map((item) => ({
      id: item.id,
      kind: item.kind,
      title: item.title,
      purpose: item.purpose,
      status: item.status,
      public_url: item.public_url,
      asset_url: item.asset_url,
      customer_notes: item.customer_notes,
      metrics: item.metrics,
      completed_at: item.completed_at,
    })),
    timeline: buildCustomerTimeline(campaign, auditLog),
  };
}
