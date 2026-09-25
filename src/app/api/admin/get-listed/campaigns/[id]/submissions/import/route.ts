import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { isAuthorizedAdmin } from "@/lib/admin-auth";
import { logAdminAction } from "@/lib/get-listed/audit";
import { isDirectoryLibraryReady } from "@/lib/get-listed/directories";
import { parseRawSubmissions, MAX_IMPORT_ROWS } from "@/lib/get-listed/import-parser";
import type { Submission } from "@/types/database";

const ADMIN_NAME_MAX = 80;

/**
 * Bulk counterpart to the one-by-one submissions POST route (../route.ts):
 * the admin pastes raw directory data copied from a spreadsheet or notes
 * instead of typing each directory in one at a time. Every valid,
 * non-duplicate row becomes exactly the same kind of `submissions` row the
 * single-add form creates — same table, same duplicate rules (by library
 * directory_id when a pasted name matches the Directory Library, else by
 * case-insensitive directory_name), same audit table, just applied to many
 * rows from one paste instead of one form submit per directory.
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
  const rawText = typeof record.rawText === "string" ? record.rawText : "";
  const adminName = typeof record.adminName === "string" ? record.adminName.trim().slice(0, ADMIN_NAME_MAX) : "";

  if (!rawText.trim()) {
    return NextResponse.json({ error: "Paste some directory data first." }, { status: 400 });
  }

  const admin = createAdminSupabaseClient();
  // "*" rather than naming deleted_at explicitly — see the identical
  // comment in ../route.ts and campaigns/[id]/route.ts.
  const { data: campaign } = await admin.from("campaigns").select("*").eq("id", campaignId).maybeSingle();
  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
  }
  if (campaign.deleted_at) {
    return NextResponse.json({ error: "This campaign is deleted. Restore it before adding submissions." }, { status: 409 });
  }

  const parsedRows = parseRawSubmissions(rawText);
  if (parsedRows.length > MAX_IMPORT_ROWS) {
    return NextResponse.json({ error: `Cannot import more than ${MAX_IMPORT_ROWS} rows at once.` }, { status: 400 });
  }

  const validRows = parsedRows.filter((r) => r.valid);
  const invalidRows = parsedRows
    .filter((r) => !r.valid)
    .map((r) => ({ line: r.lineNumber, raw: r.raw, error: r.error ?? "Invalid row." }));

  const libraryReady = await isDirectoryLibraryReady(admin);
  const directoryIdByName = new Map<string, string>();
  if (libraryReady) {
    const { data: directories } = await admin.from("directories").select("id, name");
    for (const d of directories ?? []) directoryIdByName.set(d.name.trim().toLowerCase(), d.id);
  }

  // "*" rather than naming directory_id explicitly — same schema-readiness
  // reasoning as elsewhere: it only actually exists once migration 0020 is
  // applied, and select("*") never errors on a column that isn't there yet.
  const { data: existing } = await admin.from("submissions").select("*").eq("campaign_id", campaignId);
  const existingNames = new Set((existing ?? []).map((s) => s.directory_name.trim().toLowerCase()));
  const existingDirectoryIds = new Set(
    (existing ?? []).map((s) => s.directory_id).filter((id): id is string => Boolean(id)),
  );

  const seenNamesInBatch = new Set<string>();
  const toInsert: Partial<Submission>[] = [];
  const skippedDuplicates: string[] = [];

  for (const row of validRows) {
    const nameKey = row.directoryName.toLowerCase();
    const matchedDirectoryId = libraryReady ? directoryIdByName.get(nameKey) ?? null : null;

    const isDuplicate =
      seenNamesInBatch.has(nameKey) ||
      existingNames.has(nameKey) ||
      (matchedDirectoryId ? existingDirectoryIds.has(matchedDirectoryId) : false);

    if (isDuplicate) {
      skippedDuplicates.push(row.directoryName);
      continue;
    }
    seenNamesInBatch.add(nameKey);

    toInsert.push({
      campaign_id: campaignId,
      ...(libraryReady ? { directory_id: matchedDirectoryId } : {}),
      directory_name: row.directoryName,
      directory_url: row.directoryUrl,
      status: row.status,
      listing_url: row.listingUrl,
      notes: null,
      submitted_at: row.status === "submitted" ? new Date().toISOString() : null,
    });
  }

  let imported = 0;
  if (toInsert.length > 0) {
    const { data: inserted, error } = await admin.from("submissions").insert(toInsert).select("id");
    if (error) {
      if (error.code === "23505") {
        return NextResponse.json(
          { error: "One of these directories was already submitted (possibly by a concurrent import). Please retry." },
          { status: 409 },
        );
      }
      return NextResponse.json({ error: "Could not import submissions." }, { status: 500 });
    }
    imported = inserted?.length ?? 0;
  }

  if (imported > 0) {
    await admin.from("campaigns").update({ updated_at: new Date().toISOString() }).eq("id", campaignId);
    await logAdminAction(admin, {
      campaignId,
      action: "submission_bulk_imported",
      adminIdentifier: adminName || "admin",
      metadata: {
        count: imported,
        skipped_duplicates: skippedDuplicates.length,
        invalid: invalidRows.length,
        directories: toInsert.map((r) => r.directory_name).slice(0, 50),
      },
    });
  }

  return NextResponse.json({ imported, skippedDuplicates, invalid: invalidRows, totalParsed: parsedRows.length });
}
