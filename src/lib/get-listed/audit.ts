import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type AdminClient = SupabaseClient<Database>;

export async function isAdminAuditSchemaReady(admin: AdminClient): Promise<boolean> {
  const { error } = await admin.from("admin_audit_logs").select("id").limit(1);
  return !error;
}

/**
 * The single place every admin-visible activity-timeline entry is written
 * (campaign status/edits, delete/restore, submission add/edit, payment
 * reconciliation, and the real webhook's payment confirmation). Never
 * blocks or fails the calling action if the audit table isn't there yet
 * (e.g. migration 0019 not applied) or the insert fails for any reason —
 * this is a record of what happened, not a gate on whether it's allowed to
 * happen, so a logging failure must never roll back or reject the actual
 * mutation it's describing.
 *
 * `adminIdentifier` is omitted (not just empty) for a system-generated
 * entry — e.g. a real LemonSqueezy webhook payment — so the timeline can
 * visibly distinguish "an admin did this" from "the payment system did
 * this" instead of defaulting every unattributed action to a fake name.
 *
 * `campaignId` is nullable for a Directory Library action (migration
 * 0020, Phase 3) — those are library-wide, not scoped to any campaign.
 */
export async function logAdminAction(
  admin: AdminClient,
  params: {
    campaignId: string | null;
    submissionId?: string | null;
    action: string;
    metadata?: Record<string, unknown> | null;
    adminIdentifier?: string | null;
  },
): Promise<void> {
  try {
    await admin.from("admin_audit_logs").insert({
      campaign_id: params.campaignId,
      submission_id: params.submissionId ?? null,
      admin_identifier: params.adminIdentifier ?? null,
      action: params.action,
      metadata: params.metadata ?? null,
    });
  } catch {
    // Best-effort only — see the function comment above.
  }
}
