import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { isAuthorizedAdmin } from "@/lib/admin-auth";
import type { CampaignStatus } from "@/types/database";

const VALID_STATUSES: CampaignStatus[] = [
  "draft",
  "awaiting_payment",
  "active",
  "in_progress",
  "completed",
  "cancelled",
];

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

  const { data: submissions } = await admin
    .from("submissions")
    .select("*")
    .eq("campaign_id", id)
    .order("created_at", { ascending: true });

  const { data: ownerData } = await admin.auth.admin.getUserById(campaign.owner_id);

  return NextResponse.json({
    campaign: { ...campaign, owner_email: ownerData?.user?.email ?? null },
    submissions: submissions ?? [],
  });
}

/**
 * No LemonSqueezy integration yet (Phase 1) — this is how the founder
 * manually moves a campaign forward (e.g. awaiting_payment -> active
 * after collecting payment some other way) until a real checkout exists.
 * The one rule enforced server-side regardless: completed requires the
 * real submission count to already meet the target — never trusted from
 * the client, always recounted here.
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
  const { status } = (body ?? {}) as Record<string, unknown>;
  if (typeof status !== "string" || !VALID_STATUSES.includes(status as CampaignStatus)) {
    return NextResponse.json({ error: "Invalid status." }, { status: 400 });
  }

  const admin = createAdminSupabaseClient();
  const { data: campaign } = await admin.from("campaigns").select("id,submission_target").eq("id", id).maybeSingle();
  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
  }

  if (status === "completed") {
    const { count } = await admin
      .from("submissions")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", id);
    if ((count ?? 0) < campaign.submission_target) {
      return NextResponse.json(
        { error: `Cannot mark complete: ${count ?? 0}/${campaign.submission_target} submissions recorded.` },
        { status: 400 },
      );
    }
  }

  const { data: updated, error } = await admin
    .from("campaigns")
    .update({ status: status as CampaignStatus, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();

  if (error || !updated) {
    return NextResponse.json({ error: "Could not update campaign." }, { status: 500 });
  }

  return NextResponse.json({ campaign: updated });
}
