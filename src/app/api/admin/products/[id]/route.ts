import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { isAuthorizedAdmin } from "@/lib/admin-auth";
import { logActivity } from "@/lib/arena";

/**
 * Permanently removes a product from the arena. This is a hard delete, not
 * the soft-delete-with-restore pattern Get Listed campaigns use — Arena
 * products don't have the same audit/compliance need, and the request was
 * specifically for the admin to be able to remove a product outright (spam,
 * a mistaken submission, etc.).
 *
 * `products.id` cascades through the schema already (matches -> votes and
 * reviews for those matches, champions, sponsorships all delete with it;
 * payments and free_submission_claims keep their row with product_id set
 * to null instead, preserving payment/claim history). The one thing this
 * route actively guards against is deleting a product mid-duel, which
 * would silently wipe its opponent's live match and both sides' votes out
 * from under them — that has to resolve (or the product removed from it
 * some other way) before a delete is allowed.
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAuthorizedAdmin(req)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { id } = await params;
  const admin = createAdminSupabaseClient();

  const { data: product } = await admin.from("products").select("*").eq("id", id).maybeSingle();
  if (!product) {
    return NextResponse.json({ error: "Product not found." }, { status: 404 });
  }

  const { data: activeMatch } = await admin
    .from("matches")
    .select("id")
    .or(`product_a_id.eq.${id},product_b_id.eq.${id}`)
    .eq("status", "active")
    .maybeSingle();
  if (activeMatch) {
    return NextResponse.json(
      { error: "This product is in an active duel. Wait for it to resolve before deleting." },
      { status: 409 },
    );
  }

  const { error } = await admin.from("products").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: "Could not delete product." }, { status: 500 });
  }

  await logActivity(admin, `🗑️ ${product.name} was removed from the arena by an admin`);

  return NextResponse.json({ ok: true });
}
