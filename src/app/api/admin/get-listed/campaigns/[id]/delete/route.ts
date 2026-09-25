import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { isAuthorizedAdmin } from "@/lib/admin-auth";
import { logAdminAction } from "@/lib/get-listed/audit";
import { isCampaignSoftDeleteReady } from "@/lib/get-listed/admin";

const NAME_MAX = 80;
const REASON_MAX = 300;

/**
 * Soft delete only — payment (orders, payment_reconciliations) and
 * fulfillment (submissions) history is never touched, only hidden from the
 * default admin campaign list. Atomic guard (`where deleted_at is null`)
 * makes a duplicate delete call a no-op instead of overwriting
 * deleted_at/deleted_by a second time.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAuthorizedAdmin(req)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const record = (body ?? {}) as Record<string, unknown>;
  const adminName = typeof record.adminName === "string" ? record.adminName.trim().slice(0, NAME_MAX) : "";
  const reason = typeof record.reason === "string" ? record.reason.trim().slice(0, REASON_MAX) : "";

  const admin = createAdminSupabaseClient();
  if (!(await isCampaignSoftDeleteReady(admin))) {
    return NextResponse.json({ error: "Campaign delete/restore isn't set up yet." }, { status: 503 });
  }

  const { data: updated, error } = await admin
    .from("campaigns")
    .update({ deleted_at: new Date().toISOString(), deleted_by: adminName || "admin" })
    .eq("id", id)
    .is("deleted_at", null)
    .select("*")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "Could not delete campaign." }, { status: 500 });
  }
  if (!updated) {
    const { data: exists } = await admin.from("campaigns").select("id").eq("id", id).maybeSingle();
    return NextResponse.json(
      { error: exists ? "This campaign is already deleted." : "Campaign not found." },
      { status: exists ? 409 : 404 },
    );
  }

  await logAdminAction(admin, {
    campaignId: id,
    action: "campaign_deleted",
    adminIdentifier: adminName || "admin",
    metadata: reason ? { reason } : null,
  });

  return NextResponse.json({ campaign: updated });
}
