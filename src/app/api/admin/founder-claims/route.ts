import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { isAuthorizedAdmin } from "@/lib/admin-auth";
export async function GET(req: NextRequest) {
  if (!isAuthorizedAdmin(req)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin.from("founder_product_claims").select("*, product:products!founder_product_claims_product_id_fkey(id,name,url,owner_id)").eq("status", "pending").order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: "Could not load claims." }, { status: 500 });
  const claims = await Promise.all((data ?? []).map(async (claim) => {
    const { data: profile } = await admin.auth.admin.getUserById(claim.user_id);
    return { ...claim, claimantEmail: profile.user?.email ?? null };
  }));
  return NextResponse.json({ claims });
}
export async function PATCH(req: NextRequest) {
  if (!isAuthorizedAdmin(req)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  const record = (body ?? {}) as Record<string, unknown>;
  if (typeof record.claimId !== "string" || (record.action !== "approve" && record.action !== "reject")) return NextResponse.json({ error: "Invalid claim decision." }, { status: 400 });
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin.rpc("review_founder_product_claim", { p_claim_id: record.claimId, p_approve: record.action === "approve", p_reviewer: "admin" });
  if (error) return NextResponse.json({ error: error.code === "23505" ? "This product has already been claimed." : "Could not update the claim." }, { status: error.code === "23505" ? 409 : 500 });
  if (!data) return NextResponse.json({ error: "Claim no longer pending." }, { status: 409 });
  return NextResponse.json({ claim: data });
}
