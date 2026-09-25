import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { isAuthorizedAdmin } from "@/lib/admin-auth";
import { logAdminAction } from "@/lib/get-listed/audit";
import type { SubmissionStatus } from "@/types/database";

const VALID_STATUSES: SubmissionStatus[] = ["pending", "submitted", "accepted", "rejected"];
const NAME_MAX = 120;
const URL_MAX = 300;
const NOTES_MAX = 1000;

/**
 * One row = one real, manually-performed submission — the founder adds
 * exactly one of these each time they actually go submit the startup to a
 * directory. Never auto-generated in bulk (see migration 0015's comment).
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

  const directoryName = typeof record.directoryName === "string" ? record.directoryName.trim() : "";
  if (!directoryName || directoryName.length > NAME_MAX) {
    return NextResponse.json({ error: `Directory name is required (max ${NAME_MAX} characters).` }, { status: 400 });
  }

  const status: SubmissionStatus = VALID_STATUSES.includes(record.status as SubmissionStatus)
    ? (record.status as SubmissionStatus)
    : "pending";

  const directoryUrl = typeof record.directoryUrl === "string" && record.directoryUrl.trim().length <= URL_MAX
    ? record.directoryUrl.trim() || null
    : null;
  const listingUrl = typeof record.listingUrl === "string" && record.listingUrl.trim().length <= URL_MAX
    ? record.listingUrl.trim() || null
    : null;
  const notes = typeof record.notes === "string" && record.notes.trim().length <= NOTES_MAX
    ? record.notes.trim() || null
    : null;
  const adminName = typeof record.adminName === "string" ? record.adminName.trim().slice(0, 80) : "";

  const admin = createAdminSupabaseClient();
  // "*" rather than naming deleted_at explicitly — see the identical
  // comment in campaigns/[id]/route.ts: naming a column that doesn't exist
  // yet (migration 0019 not applied) would error this whole query out.
  const { data: campaign } = await admin.from("campaigns").select("*").eq("id", campaignId).maybeSingle();
  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
  }
  if (campaign.deleted_at) {
    return NextResponse.json({ error: "This campaign is deleted. Restore it before adding submissions." }, { status: 409 });
  }

  const { data: submission, error } = await admin
    .from("submissions")
    .insert({
      campaign_id: campaignId,
      directory_name: directoryName,
      directory_url: directoryUrl,
      status,
      listing_url: listingUrl,
      notes,
      // Never a client-supplied timestamp — set here, only when the
      // submission is actually recorded as submitted.
      submitted_at: status === "submitted" ? new Date().toISOString() : null,
    })
    .select("*")
    .single();

  if (error || !submission) {
    return NextResponse.json({ error: "Could not add submission." }, { status: 500 });
  }

  await admin.from("campaigns").update({ updated_at: new Date().toISOString() }).eq("id", campaignId);
  await logAdminAction(admin, {
    campaignId,
    submissionId: submission.id,
    action: "submission_added",
    adminIdentifier: adminName || "admin",
    metadata: { directory: directoryName, status },
  });

  return NextResponse.json({ submission }, { status: 201 });
}
