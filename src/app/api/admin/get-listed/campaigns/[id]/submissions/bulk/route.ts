import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { isAuthorizedAdmin } from "@/lib/admin-auth";
import { logAdminAction } from "@/lib/get-listed/audit";
import type { Submission, SubmissionStatus } from "@/types/database";

const BULK_ACTION_TO_STATUS: Record<string, SubmissionStatus> = {
  mark_submitted: "submitted",
  mark_accepted: "accepted",
  mark_rejected: "rejected",
  mark_pending: "pending",
};
const MAX_IDS = 200;
const ADMIN_NAME_MAX = 80;

/**
 * The only bulk operation Phase 3 supports: setting the same status on a
 * batch of submissions. Never trusts the submission ids as belonging to
 * this campaign — the update itself is scoped with `.eq("campaign_id",
 * campaignId)` in the same query, so an id for a different campaign is
 * silently excluded rather than acted on. One audit entry per bulk call
 * (not one per row), recording exactly which ids were affected.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAuthorizedAdmin(req)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const { id: campaignId } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const record = (body ?? {}) as Record<string, unknown>;

  const action = typeof record.action === "string" ? record.action : "";
  const nextStatus = BULK_ACTION_TO_STATUS[action];
  if (!nextStatus) {
    return NextResponse.json({ error: "Invalid bulk action." }, { status: 400 });
  }

  const submissionIds = Array.isArray(record.submissionIds)
    ? record.submissionIds.filter((id): id is string => typeof id === "string")
    : [];
  if (submissionIds.length === 0) {
    return NextResponse.json({ error: "No submissions selected." }, { status: 400 });
  }
  if (submissionIds.length > MAX_IDS) {
    return NextResponse.json({ error: `Cannot update more than ${MAX_IDS} submissions at once.` }, { status: 400 });
  }
  const adminName = typeof record.adminName === "string" ? record.adminName.trim().slice(0, ADMIN_NAME_MAX) : "";

  const admin = createAdminSupabaseClient();
  const { data: campaign } = await admin.from("campaigns").select("*").eq("id", campaignId).maybeSingle();
  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
  }
  if (campaign.deleted_at) {
    return NextResponse.json({ error: "This campaign is deleted. Restore it before editing submissions." }, { status: 409 });
  }

  const update: Record<string, unknown> = { status: nextStatus, updated_at: new Date().toISOString() };
  if (nextStatus === "submitted") update.submitted_at = new Date().toISOString();

  const { data: updated, error } = await admin
    .from("submissions")
    .update(update as Partial<Submission>)
    .eq("campaign_id", campaignId)
    .in("id", submissionIds)
    .select("id");

  if (error) {
    return NextResponse.json({ error: "Could not update submissions." }, { status: 500 });
  }

  await admin.from("campaigns").update({ updated_at: new Date().toISOString() }).eq("id", campaignId);
  await logAdminAction(admin, {
    campaignId,
    action: "bulk_submission_update",
    adminIdentifier: adminName || "admin",
    metadata: { to_status: nextStatus, submission_ids: (updated ?? []).map((s) => s.id), count: updated?.length ?? 0 },
  });

  return NextResponse.json({ updatedCount: updated?.length ?? 0 });
}
