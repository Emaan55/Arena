import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { isAuthorizedAdmin } from "@/lib/admin-auth";
import { logAdminAction } from "@/lib/get-listed/audit";
import type { Submission, SubmissionStatus } from "@/types/database";

const VALID_STATUSES: SubmissionStatus[] = ["pending", "submitted", "accepted", "rejected"];
const URL_MAX = 300;
const NOTES_MAX = 1000;

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAuthorizedAdmin(req)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const record = (body ?? {}) as Record<string, unknown>;

  const admin = createAdminSupabaseClient();
  const { data: existing } = await admin
    .from("submissions")
    .select("id,campaign_id,directory_name,status,submitted_at")
    .eq("id", id)
    .maybeSingle();
  if (!existing) {
    return NextResponse.json({ error: "Submission not found." }, { status: 404 });
  }
  // "*" rather than naming deleted_at explicitly — see the identical
  // comment in campaigns/[id]/route.ts: naming a column that doesn't exist
  // yet (migration 0019 not applied) would error this whole query out.
  const { data: parentCampaign } = await admin
    .from("campaigns")
    .select("*")
    .eq("id", existing.campaign_id)
    .maybeSingle();
  if (parentCampaign?.deleted_at) {
    return NextResponse.json({ error: "This campaign is deleted. Restore it before editing submissions." }, { status: 409 });
  }

  const adminName = typeof record.adminName === "string" ? record.adminName.trim().slice(0, 80) : "";
  const update: Partial<Submission> = { updated_at: new Date().toISOString() };
  const changedFields: string[] = [];
  let statusChanged = false;

  if (record.status !== undefined) {
    if (!VALID_STATUSES.includes(record.status as SubmissionStatus)) {
      return NextResponse.json({ error: "Invalid status." }, { status: 400 });
    }
    if (record.status !== existing.status) {
      update.status = record.status as SubmissionStatus;
      changedFields.push("status");
      statusChanged = true;
    }
    // "When status becomes submitted, automatically set submitted_at" —
    // only on the transition into submitted, and never from a
    // client-supplied timestamp.
    if (record.status === "submitted" && existing.status !== "submitted") {
      update.submitted_at = new Date().toISOString();
    }
  }

  if (record.listingUrl !== undefined) {
    const v = typeof record.listingUrl === "string" ? record.listingUrl.trim() : "";
    update.listing_url = v && v.length <= URL_MAX ? v : null;
    changedFields.push("listing_url");
  }

  if (record.directoryUrl !== undefined) {
    const v = typeof record.directoryUrl === "string" ? record.directoryUrl.trim() : "";
    update.directory_url = v && v.length <= URL_MAX ? v : null;
    changedFields.push("directory_url");
  }

  if (record.notes !== undefined) {
    const v = typeof record.notes === "string" ? record.notes.trim() : "";
    update.notes = v && v.length <= NOTES_MAX ? v : null;
    changedFields.push("notes");
  }

  const { data: updated, error } = await admin
    .from("submissions")
    .update(update)
    .eq("id", id)
    .select("*")
    .single();

  if (error || !updated) {
    return NextResponse.json({ error: "Could not update submission." }, { status: 500 });
  }

  await admin.from("campaigns").update({ updated_at: new Date().toISOString() }).eq("id", existing.campaign_id);

  if (changedFields.length > 0) {
    await logAdminAction(admin, {
      campaignId: existing.campaign_id,
      submissionId: id,
      action: statusChanged ? "submission_status_changed" : "submission_edited",
      adminIdentifier: adminName || "admin",
      metadata: {
        directory: existing.directory_name,
        changed_fields: changedFields,
        // Only present when status actually changed — lets a customer-safe
        // timeline phrase this meaningfully ("Product Hunt accepted")
        // without needing to re-derive it from the submission row later.
        ...(statusChanged ? { from_status: existing.status, to_status: update.status } : {}),
      },
    });
  }

  return NextResponse.json({ submission: updated });
}
