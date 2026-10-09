import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedAdmin } from "@/lib/admin-auth";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!isAuthorizedAdmin(req)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const admin = createAdminSupabaseClient();
  const [products, liveDuels, champions, activeCampaigns, awaitingPayment, pendingClaims, draftAnnouncements, sponsorQueue] =
    await Promise.all([
      admin.from("products").select("id", { count: "exact", head: true }),
      admin.from("matches").select("id", { count: "exact", head: true }).eq("status", "active"),
      admin.from("champions").select("id", { count: "exact", head: true }),
      admin.from("campaigns").select("id", { count: "exact", head: true }).in("status", ["active", "in_progress"]),
      admin.from("campaigns").select("id", { count: "exact", head: true }).eq("status", "awaiting_payment"),
      admin.from("founder_product_claims").select("id", { count: "exact", head: true }).eq("status", "pending"),
      admin.from("arena_announcements").select("id", { count: "exact", head: true }).eq("status", "draft"),
      admin.from("sponsorships").select("id", { count: "exact", head: true }).eq("status", "queued"),
    ]);

  const value = (result: { count: number | null; error: unknown }) => (result.error ? null : (result.count ?? 0));

  return NextResponse.json({
    stats: {
      products: value(products),
      liveDuels: value(liveDuels),
      champions: value(champions),
      activeCampaigns: value(activeCampaigns),
      awaitingPayment: value(awaitingPayment),
      pendingClaims: value(pendingClaims),
      draftAnnouncements: value(draftAnnouncements),
      sponsorQueue: value(sponsorQueue),
    },
    updatedAt: new Date().toISOString(),
  });
}

