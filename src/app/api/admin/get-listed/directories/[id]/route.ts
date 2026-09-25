import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { isAuthorizedAdmin } from "@/lib/admin-auth";
import { computeDirectoryStats } from "@/lib/get-listed/directories";
import { logAdminAction } from "@/lib/get-listed/audit";
import type { Directory, DirectoryStatus } from "@/types/database";

const NAME_MAX = 120;
const URL_MAX = 300;
const CATEGORY_MAX = 60;
const NOTES_MAX = 2000;
const SHORT_MAX = 60;
const ADMIN_NAME_MAX = 80;

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAuthorizedAdmin(req)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const { id } = await params;

  const admin = createAdminSupabaseClient();
  const { data: directory } = await admin.from("directories").select("*").eq("id", id).maybeSingle();
  if (!directory) {
    return NextResponse.json({ error: "Directory not found." }, { status: 404 });
  }

  // Lightweight, descriptive-only stats (see the Phase 3 spec's explicit
  // "no predictions or quality rankings") — real submissions this
  // directory has actually been used for, nothing else.
  const { data: submissions } = await admin
    .from("submissions")
    .select("status, submitted_at, created_at")
    .eq("directory_id", id);

  return NextResponse.json({ directory, stats: computeDirectoryStats(submissions ?? []) });
}

/**
 * Editing a library entry (name, URL, notes, status, etc.) never touches
 * any existing submission row — directory_name/directory_url on a
 * submission are a snapshot taken at add-time (migration 0015/0020's
 * comments), not a live reference. This is intentionally the only place a
 * directory can be deactivated; there is no hard-delete route, since
 * historical submissions may still reference this row.
 */
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
  const adminName = typeof record.adminName === "string" ? record.adminName.trim().slice(0, ADMIN_NAME_MAX) : "";

  const admin = createAdminSupabaseClient();
  const { data: existingRow } = await admin.from("directories").select("*").eq("id", id).maybeSingle();
  if (!existingRow) {
    return NextResponse.json({ error: "Directory not found." }, { status: 404 });
  }
  const existing = existingRow;

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const changedFields: string[] = [];
  let statusChange: { from: string; to: string } | null = null;

  function applyString(field: string, column: string, max: number, required = false) {
    if (record[field] === undefined) return;
    const v = typeof record[field] === "string" ? (record[field] as string).trim() : "";
    const next = v && v.length <= max ? v : required ? existing[column as keyof typeof existing] : null;
    if (next !== (existing[column as keyof typeof existing] ?? null)) {
      update[column] = next;
      changedFields.push(column);
    }
  }

  applyString("name", "name", NAME_MAX, true);
  applyString("websiteUrl", "website_url", URL_MAX, true);
  applyString("submissionUrl", "submission_url", URL_MAX);
  applyString("category", "category", CATEGORY_MAX);
  applyString("notes", "notes", NOTES_MAX);
  applyString("typicalReviewTime", "typical_review_time", SHORT_MAX);
  applyString("difficulty", "difficulty", SHORT_MAX);
  applyString("freeOrPaid", "free_or_paid", SHORT_MAX);

  if (record.status !== undefined) {
    if (record.status !== "active" && record.status !== "inactive") {
      return NextResponse.json({ error: "Invalid status." }, { status: 400 });
    }
    if (record.status !== existing.status) {
      statusChange = { from: existing.status, to: record.status as DirectoryStatus };
      update.status = record.status as DirectoryStatus;
      changedFields.push("status");
    }
  }

  if (record.lastCheckedNow === true) {
    update.last_checked_at = new Date().toISOString();
    changedFields.push("last_checked_at");
  }

  if (changedFields.length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  const { data: updated, error } = await admin.from("directories").update(update as Partial<Directory>).eq("id", id).select("*").single();
  if (error || !updated) {
    return NextResponse.json({ error: "Could not update directory." }, { status: 500 });
  }

  if (statusChange) {
    await logAdminAction(admin, {
      campaignId: null,
      action: statusChange.to === "active" ? "directory_activated" : "directory_deactivated",
      adminIdentifier: adminName || "admin",
      metadata: { directory_id: id, name: existing.name },
    });
  }
  const editedFields = changedFields.filter((f) => f !== "status" && f !== "last_checked_at");
  if (editedFields.length > 0) {
    await logAdminAction(admin, {
      campaignId: null,
      action: "directory_edited",
      adminIdentifier: adminName || "admin",
      metadata: { directory_id: id, name: existing.name, changed_fields: editedFields },
    });
  }

  return NextResponse.json({ directory: updated });
}
