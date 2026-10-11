import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedAdmin } from "@/lib/admin-auth";
import { logAdminAction } from "@/lib/get-listed/audit";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { CampaignDeliverable, CampaignDeliverableStatus } from "@/types/database";

const VALID_STATUSES: CampaignDeliverableStatus[] = ["pending", "in_progress", "completed", "not_applicable"];
const URL_MAX = 500;
const NOTES_MAX = 2000;

function optionalText(value: unknown, max: number): string | null | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= max ? trimmed : null;
}

function isSafePublicUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function safeMetrics(value: unknown): Record<string, string | number> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const entries = Object.entries(value as Record<string, unknown>).slice(0, 20);
  const metrics: Record<string, string | number> = {};
  for (const [rawKey, rawValue] of entries) {
    const key = rawKey.trim().slice(0, 50);
    if (!key) continue;
    if (typeof rawValue === "number" && Number.isFinite(rawValue)) metrics[key] = rawValue;
    else if (typeof rawValue === "string" && rawValue.trim()) metrics[key] = rawValue.trim().slice(0, 200);
  }
  return metrics;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; deliverableId: string }> },
) {
  if (!isAuthorizedAdmin(req)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const { id: campaignId, deliverableId } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const record = (body ?? {}) as Record<string, unknown>;
  const admin = createAdminSupabaseClient();

  const [{ data: campaign }, { data: existing }] = await Promise.all([
    admin.from("campaigns").select("*").eq("id", campaignId).maybeSingle(),
    admin.from("campaign_deliverables").select("*").eq("id", deliverableId).eq("campaign_id", campaignId).maybeSingle(),
  ]);
  if (!campaign || !existing) return NextResponse.json({ error: "Deliverable not found." }, { status: 404 });
  if (campaign.deleted_at) return NextResponse.json({ error: "Restore this campaign before editing deliverables." }, { status: 409 });

  const update: Partial<CampaignDeliverable> = { updated_at: new Date().toISOString() };
  if (record.status !== undefined) {
    if (!VALID_STATUSES.includes(record.status as CampaignDeliverableStatus)) {
      return NextResponse.json({ error: "Invalid status." }, { status: 400 });
    }
    update.status = record.status as CampaignDeliverableStatus;
    update.completed_at = record.status === "completed" ? existing.completed_at ?? new Date().toISOString() : null;
  }

  const publicUrl = optionalText(record.publicUrl, URL_MAX);
  const assetUrl = optionalText(record.assetUrl, URL_MAX);
  const customerNotes = optionalText(record.customerNotes, NOTES_MAX);
  const adminNotes = optionalText(record.adminNotes, NOTES_MAX);
  if ((publicUrl && !isSafePublicUrl(publicUrl)) || (assetUrl && !isSafePublicUrl(assetUrl))) {
    return NextResponse.json({ error: "Links must be valid HTTP or HTTPS URLs." }, { status: 400 });
  }
  if (publicUrl !== undefined) update.public_url = publicUrl;
  if (assetUrl !== undefined) update.asset_url = assetUrl;
  if (customerNotes !== undefined) update.customer_notes = customerNotes;
  if (adminNotes !== undefined) update.admin_notes = adminNotes;
  if (record.metrics !== undefined) {
    const metrics = safeMetrics(record.metrics);
    if (metrics === null) return NextResponse.json({ error: "Invalid metrics." }, { status: 400 });
    update.metrics = metrics;
  }

  if (update.status === "completed") {
    if (existing.kind === "directory") {
      const { count } = await admin
        .from("submissions")
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", campaignId);
      if ((count ?? 0) < campaign.submission_target) {
        return NextResponse.json(
          { error: `Record all ${campaign.submission_target} directory submissions before completing this deliverable.` },
          { status: 400 },
        );
      }
    } else {
      const hasEvidence = Boolean(
        (publicUrl !== undefined ? publicUrl : existing.public_url) ||
          (assetUrl !== undefined ? assetUrl : existing.asset_url) ||
          (customerNotes !== undefined ? customerNotes : existing.customer_notes),
      );
      if (!hasEvidence) {
        return NextResponse.json(
          { error: "Add a published link, asset link, or customer-visible completion note before marking this complete." },
          { status: 400 },
        );
      }
    }
  }

  const { data: deliverable, error } = await admin
    .from("campaign_deliverables")
    .update(update)
    .eq("id", deliverableId)
    .eq("campaign_id", campaignId)
    .select("*")
    .single();
  if (error || !deliverable) return NextResponse.json({ error: "Could not update deliverable." }, { status: 500 });

  await admin.from("campaigns").update({ updated_at: new Date().toISOString() }).eq("id", campaignId);
  await logAdminAction(admin, {
    campaignId,
    action: "deliverable_updated",
    adminIdentifier: typeof record.adminName === "string" && record.adminName.trim() ? record.adminName.trim().slice(0, 80) : "admin",
    metadata: { title: existing.title, from_status: existing.status, to_status: deliverable.status },
  });

  return NextResponse.json({ deliverable });
}

