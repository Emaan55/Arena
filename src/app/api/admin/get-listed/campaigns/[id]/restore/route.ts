import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { isAuthorizedAdmin } from "@/lib/admin-auth";
import { logAdminAction } from "@/lib/get-listed/audit";
import { isCampaignSoftDeleteReady } from "@/lib/get-listed/admin";

const NAME_MAX = 80;

/**
 * Undoes a soft delete. Payment and fulfillment history were never touched
 * by the delete in the first place, so restoring is just clearing
 * deleted_at/deleted_by — atomically guarded so restoring an
 * already-active campaign is a no-op rather than clobbering anything.
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

  const admin = createAdminSupabaseClient();
  if (!(await isCampaignSoftDeleteReady(admin))) {
    return NextResponse.json({ error: "Campaign delete/restore isn't set up yet." }, { status: 503 });
  }

  const { data: updated, error } = await admin
    .from("campaigns")
    .update({ deleted_at: null, deleted_by: null })
    .eq("id", id)
    .not("deleted_at", "is", null)
    .select("*")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "Could not restore campaign." }, { status: 500 });
  }
  if (!updated) {
    const { data: exists } = await admin.from("campaigns").select("id").eq("id", id).maybeSingle();
    return NextResponse.json(
      { error: exists ? "This campaign isn't deleted." : "Campaign not found." },
      { status: exists ? 409 : 404 },
    );
  }

  await logAdminAction(admin, {
    campaignId: id,
    action: "campaign_restored",
    adminIdentifier: adminName || "admin",
  });

  return NextResponse.json({ campaign: updated });
}
