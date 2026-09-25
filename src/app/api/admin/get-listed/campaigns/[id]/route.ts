import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { isAuthorizedAdmin } from "@/lib/admin-auth";
import { logAdminAction, isAdminAuditSchemaReady } from "@/lib/get-listed/audit";
import { derivePaymentStatus, summarizeSubmissions } from "@/lib/get-listed/admin";
import { CATEGORIES, type Campaign, type CampaignStatus, type Category } from "@/types/database";

const VALID_STATUSES: CampaignStatus[] = [
  "draft",
  "awaiting_payment",
  "active",
  "in_progress",
  "completed",
  "cancelled",
];

const NAME_MAX = 80;
const DESCRIPTION_MAX = 500;
const URL_MAX = 300;

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAuthorizedAdmin(req)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const { id } = await params;

  const admin = createAdminSupabaseClient();
  const { data: campaign } = await admin.from("campaigns").select("*").eq("id", id).maybeSingle();
  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
  }

  const [{ data: submissions }, { data: ownerData }, { data: orders }] = await Promise.all([
    admin.from("submissions").select("*").eq("campaign_id", id).order("created_at", { ascending: true }),
    admin.auth.admin.getUserById(campaign.owner_id),
    admin.from("orders").select("*").eq("campaign_id", id).order("created_at", { ascending: false }),
  ]);

  let auditLog: unknown[] = [];
  if (await isAdminAuditSchemaReady(admin)) {
    const { data } = await admin
      .from("admin_audit_logs")
      .select("*")
      .eq("campaign_id", id)
      .order("created_at", { ascending: false });
    auditLog = data ?? [];
  }

  const paymentStatus = derivePaymentStatus(orders ?? []);
  const submissionSummary = summarizeSubmissions(submissions ?? [], campaign.submission_target);

  return NextResponse.json({
    campaign: { ...campaign, owner_email: ownerData?.user?.email ?? null },
    submissions: submissions ?? [],
    orders: orders ?? [],
    auditLog,
    paymentStatus,
    submissionSummary,
  });
}

/**
 * Two independent things can change here: fulfillment `status` (unchanged
 * from before — the founder manually moves a paid campaign through
 * fulfillment) and basic customer-info fields (new). Package, submission
 * target, and anything payment-related stay read-only in this route on
 * purpose — see migration 0018/finalize_get_listed_order for the only
 * place payment status legitimately changes, and lib/get-listed/packages.ts
 * for why price/target are never edited in place.
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
  const adminName = typeof record.adminName === "string" ? record.adminName.trim().slice(0, NAME_MAX) : "";

  const admin = createAdminSupabaseClient();
  // "*" rather than naming deleted_at explicitly — if migration 0019
  // hasn't been applied yet, naming a nonexistent column would error this
  // whole route out instead of just leaving campaign.deleted_at undefined
  // (falsy, same as null for every check below).
  const { data: existing } = await admin.from("campaigns").select("*").eq("id", id).maybeSingle();
  if (!existing) {
    return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
  }
  if (existing.deleted_at) {
    return NextResponse.json({ error: "This campaign is deleted. Restore it before making changes." }, { status: 409 });
  }

  const update: Partial<Campaign> = { updated_at: new Date().toISOString() };
  const changedFields: string[] = [];
  let statusChange: { from: CampaignStatus; to: CampaignStatus } | null = null;

  if (record.status !== undefined) {
    if (typeof record.status !== "string" || !VALID_STATUSES.includes(record.status as CampaignStatus)) {
      return NextResponse.json({ error: "Invalid status." }, { status: 400 });
    }
    if (record.status === "completed") {
      const { count } = await admin
        .from("submissions")
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", id);
      if ((count ?? 0) < existing.submission_target) {
        return NextResponse.json(
          { error: `Cannot mark complete: ${count ?? 0}/${existing.submission_target} submissions recorded.` },
          { status: 400 },
        );
      }
    }
    if (record.status !== existing.status) {
      statusChange = { from: existing.status, to: record.status as CampaignStatus };
      update.status = record.status as CampaignStatus;
      changedFields.push("status");
    }
  }

  function editableString(field: keyof typeof record, max: number): string | undefined {
    if (record[field] === undefined) return undefined;
    const v = typeof record[field] === "string" ? (record[field] as string).trim() : "";
    return v.slice(0, max);
  }

  const startupName = editableString("startupName", NAME_MAX);
  if (startupName !== undefined && startupName && startupName !== existing.startup_name) {
    update.startup_name = startupName;
    changedFields.push("startup_name");
  }
  const websiteUrl = editableString("websiteUrl", URL_MAX);
  if (websiteUrl !== undefined && websiteUrl && websiteUrl !== existing.website_url) {
    update.website_url = websiteUrl;
    changedFields.push("website_url");
  }
  const description = editableString("description", DESCRIPTION_MAX);
  if (description !== undefined && description && description !== existing.description) {
    update.description = description;
    changedFields.push("description");
  }
  if (record.category !== undefined) {
    if (!CATEGORIES.includes(record.category as Category)) {
      return NextResponse.json({ error: "Invalid category." }, { status: 400 });
    }
    if (record.category !== existing.category) {
      update.category = record.category as Category;
      changedFields.push("category");
    }
  }
  for (const [field, column] of [
    ["xUrl", "x_url"],
    ["linkedinUrl", "linkedin_url"],
    ["otherUrl", "other_url"],
  ] as const) {
    if (record[field] === undefined) continue;
    const v = typeof record[field] === "string" ? record[field].trim() : "";
    const next = v && v.length <= URL_MAX ? v : null;
    if (next !== (existing[column] ?? null)) {
      (update as Record<string, unknown>)[column] = next;
      changedFields.push(column);
    }
  }

  if (changedFields.length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  const { data: updated, error } = await admin
    .from("campaigns")
    .update(update)
    .eq("id", id)
    .select("*")
    .single();

  if (error || !updated) {
    return NextResponse.json({ error: "Could not update campaign." }, { status: 500 });
  }

  if (statusChange) {
    await logAdminAction(admin, {
      campaignId: id,
      action: "status_changed",
      adminIdentifier: adminName || "admin",
      metadata: statusChange,
    });
  }
  const editedFields = changedFields.filter((f) => f !== "status");
  if (editedFields.length > 0) {
    await logAdminAction(admin, {
      campaignId: id,
      action: "campaign_edited",
      adminIdentifier: adminName || "admin",
      metadata: { changed_fields: editedFields },
    });
  }

  return NextResponse.json({ campaign: updated });
}
