import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { isAuthorizedAdmin } from "@/lib/admin-auth";
import { isDirectoryLibraryReady } from "@/lib/get-listed/directories";
import { logAdminAction } from "@/lib/get-listed/audit";
import type { DirectoryStatus } from "@/types/database";

const PAGE_SIZE_DEFAULT = 25;
const PAGE_SIZE_MAX = 100;
const CANDIDATE_CAP = 2000;

const NAME_MAX = 120;
const URL_MAX = 300;
const CATEGORY_MAX = 60;
const NOTES_MAX = 2000;
const SHORT_MAX = 60;
const ADMIN_NAME_MAX = 80;

/**
 * Founder-only Directory Library — search/filter/pagination all happen
 * server-side, same reasoning as the campaign list (lib/get-listed/admin.ts):
 * the browser never receives more than a page, and nothing here is public
 * or customer-facing. Filtering/sorting still happens in-process rather
 * than raw SQL, matching this codebase's one established pattern.
 */
export async function GET(req: NextRequest) {
  if (!isAuthorizedAdmin(req)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const admin = createAdminSupabaseClient();
  if (!(await isDirectoryLibraryReady(admin))) {
    return NextResponse.json({ directories: [], total: 0, page: 1, pageSize: PAGE_SIZE_DEFAULT, libraryReady: false });
  }

  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim().toLowerCase() ?? "";
  const status = url.searchParams.get("status") ?? "all";
  const category = url.searchParams.get("category") ?? "all";
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const pageSize = Math.min(PAGE_SIZE_MAX, Math.max(1, Number(url.searchParams.get("pageSize")) || PAGE_SIZE_DEFAULT));

  let query = admin.from("directories").select("*").limit(CANDIDATE_CAP);
  if (status === "active" || status === "inactive") query = query.eq("status", status);
  if (category !== "all") query = query.eq("category", category);

  const { data } = await query;
  let rows = data ?? [];

  if (q) {
    rows = rows.filter(
      (d) => d.name.toLowerCase().includes(q) || d.website_url.toLowerCase().includes(q) || (d.category ?? "").toLowerCase().includes(q),
    );
  }

  rows.sort((a, b) => a.name.localeCompare(b.name));

  const total = rows.length;
  const start = (page - 1) * pageSize;
  const pageRows = rows.slice(start, start + pageSize);

  return NextResponse.json({ directories: pageRows, total, page, pageSize, libraryReady: true });
}

export async function POST(req: NextRequest) {
  if (!isAuthorizedAdmin(req)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const admin = createAdminSupabaseClient();
  if (!(await isDirectoryLibraryReady(admin))) {
    return NextResponse.json({ error: "Directory Library isn't set up yet." }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const record = (body ?? {}) as Record<string, unknown>;

  const name = typeof record.name === "string" ? record.name.trim() : "";
  if (!name || name.length > NAME_MAX) {
    return NextResponse.json({ error: `Directory name is required (max ${NAME_MAX} characters).` }, { status: 400 });
  }
  const websiteUrl = typeof record.websiteUrl === "string" ? record.websiteUrl.trim() : "";
  if (!websiteUrl || websiteUrl.length > URL_MAX) {
    return NextResponse.json({ error: "A valid website URL is required." }, { status: 400 });
  }

  function optionalString(field: string, max: number): string | null {
    const v = typeof record[field] === "string" ? (record[field] as string).trim() : "";
    return v && v.length <= max ? v : null;
  }

  const adminName = typeof record.adminName === "string" ? record.adminName.trim().slice(0, ADMIN_NAME_MAX) : "";

  const { data: directory, error } = await admin
    .from("directories")
    .insert({
      name,
      website_url: websiteUrl,
      submission_url: optionalString("submissionUrl", URL_MAX),
      category: optionalString("category", CATEGORY_MAX),
      status: (record.status === "inactive" ? "inactive" : "active") as DirectoryStatus,
      notes: optionalString("notes", NOTES_MAX),
      typical_review_time: optionalString("typicalReviewTime", SHORT_MAX),
      difficulty: optionalString("difficulty", SHORT_MAX),
      free_or_paid: optionalString("freeOrPaid", SHORT_MAX),
    })
    .select("*")
    .single();

  if (error || !directory) {
    return NextResponse.json({ error: "Could not create directory." }, { status: 500 });
  }

  await logAdminAction(admin, {
    campaignId: null,
    action: "directory_created",
    adminIdentifier: adminName || "admin",
    metadata: { directory_id: directory.id, name: directory.name },
  });

  return NextResponse.json({ directory }, { status: 201 });
}
