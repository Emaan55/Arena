import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { isAuthorizedAdmin } from "@/lib/admin-auth";
import { logAdminAction } from "@/lib/get-listed/audit";
import { isDirectoryLibraryReady } from "@/lib/get-listed/directories";
import type { SubmissionStatus } from "@/types/database";

const VALID_STATUSES: SubmissionStatus[] = ["pending", "submitted", "accepted", "rejected"];
const NAME_MAX = 120;
const URL_MAX = 300;
const NOTES_MAX = 1000;

/**
 * One row = one real, manually-performed submission — the founder adds
 * exactly one of these each time they actually go submit the startup to a
 * directory. Never auto-generated in bulk (see migration 0015's comment).
 *
 * `directoryId` (Phase 3, optional) links this submission back to a
 * Directory Library entry purely for stats/duplicate-detection/future
 * prefill — the actual directory_name/directory_url stored here are
 * always whatever the admin submitted (a prefill they may have edited),
 * never re-derived from the library at insert time, so this row stays a
 * true snapshot even if the library entry changes later.
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
  const libraryReady = await isDirectoryLibraryReady(admin);
  const directoryId = libraryReady && typeof record.directoryId === "string" && record.directoryId ? record.directoryId : null;
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

  if (directoryId) {
    const { data: directory } = await admin.from("directories").select("id").eq("id", directoryId).maybeSingle();
    if (!directory) {
      return NextResponse.json({ error: "Directory not found." }, { status: 400 });
    }
    const { data: existingForDirectory } = await admin
      .from("submissions")
      .select("id")
      .eq("campaign_id", campaignId)
      .eq("directory_id", directoryId)
      .maybeSingle();
    if (existingForDirectory) {
      return NextResponse.json({ error: "This directory has already been submitted for this campaign." }, { status: 409 });
    }
  } else {
    // No library link — still a light duplicate check on the name itself,
    // server-side, not just left to the frontend.
    const { data: existingByName } = await admin
      .from("submissions")
      .select("id, directory_name")
      .eq("campaign_id", campaignId);
    const isDuplicateName = (existingByName ?? []).some((s) => s.directory_name.trim().toLowerCase() === directoryName.toLowerCase());
    if (isDuplicateName) {
      return NextResponse.json({ error: "This directory has already been submitted for this campaign." }, { status: 409 });
    }
  }

  const { data: submission, error } = await admin
    .from("submissions")
    .insert({
      campaign_id: campaignId,
      // Only include directory_id when migration 0020 is applied — naming
      // a column that doesn't exist yet errors the whole insert out, same
      // reasoning as the select("*") comment above.
      ...(libraryReady ? { directory_id: directoryId } : {}),
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

  if (error) {
    // 23505 = unique_violation on (campaign_id, directory_id) — the DB-level
    // backstop for the same race the pre-insert check above already covers
    // in the common case.
    if (error.code === "23505") {
      return NextResponse.json({ error: "This directory has already been submitted for this campaign." }, { status: 409 });
    }
    return NextResponse.json({ error: "Could not add submission." }, { status: 500 });
  }
  if (!submission) {
    return NextResponse.json({ error: "Could not add submission." }, { status: 500 });
  }

  await admin.from("campaigns").update({ updated_at: new Date().toISOString() }).eq("id", campaignId);
  await logAdminAction(admin, {
    campaignId,
    submissionId: submission.id,
    action: directoryId ? "submission_added_from_library" : "submission_added",
    adminIdentifier: adminName || "admin",
    metadata: { directory: directoryName, status, directory_id: directoryId },
  });

  return NextResponse.json({ submission }, { status: 201 });
}
