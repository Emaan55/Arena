import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { isAuthorizedAdmin } from "@/lib/admin-auth";

/** Founder-only: every campaign across every customer, with owner email and real submission counts. */
export async function GET(req: NextRequest) {
  if (!isAuthorizedAdmin(req)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const admin = createAdminSupabaseClient();
  const { data: campaigns } = await admin.from("campaigns").select("*").order("created_at", { ascending: false });

  const ids = (campaigns ?? []).map((c) => c.id);
  const counts: Record<string, number> = {};
  if (ids.length > 0) {
    const { data: rows } = await admin.from("submissions").select("campaign_id").in("campaign_id", ids);
    for (const row of rows ?? []) {
      counts[row.campaign_id] = (counts[row.campaign_id] ?? 0) + 1;
    }
  }

  // auth.users isn't a normal Postgres table reachable via the query
  // builder — the service-role admin API's listUsers() is the correct way
  // to resolve owner emails for display here.
  const { data: usersPage } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const emailById = new Map((usersPage?.users ?? []).map((u) => [u.id, u.email ?? null]));

  const withDetails = (campaigns ?? []).map((c) => ({
    ...c,
    submission_count: counts[c.id] ?? 0,
    owner_email: emailById.get(c.owner_id) ?? null,
  }));

  return NextResponse.json({ campaigns: withDetails });
}
