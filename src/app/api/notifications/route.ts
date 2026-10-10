import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createRouteHandlerSupabaseClient } from "@/lib/supabase/server";
export async function GET(req: NextRequest) {
  const auth = await createRouteHandlerSupabaseClient(); const { data: { user } } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in to view notifications." }, { status: 401 });
  const pageNo = Number(req.nextUrl.searchParams.get("page") ?? 0);
  if (!Number.isInteger(pageNo) || pageNo < 0 || pageNo > 10000) return NextResponse.json({ error: "Invalid page." }, { status: 400 });
  const admin = createAdminSupabaseClient();
  const [page, unread] = await Promise.all([
    admin.from("founder_notifications").select("id,event_type,title,body,href,read_at,created_at", { count: "exact" }).eq("user_id", user.id).eq("in_app_visible", true).order("created_at", { ascending: false }).order("id", { ascending: false }).range(pageNo * 20, pageNo * 20 + 19),
    admin.from("founder_notifications").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("in_app_visible", true).is("read_at", null),
  ]);
  if (page.error) return NextResponse.json({ error: "Could not load notifications." }, { status: 500 });
  return NextResponse.json({ notifications: page.data ?? [], total: page.count ?? 0, unreadCount: unread.count ?? 0, page: pageNo, hasMore: (page.count ?? 0) > (pageNo + 1) * 20 });
}
export async function PATCH(req: NextRequest) {
  const auth = await createRouteHandlerSupabaseClient(); const { data: { user } } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in to update notifications." }, { status: 401 });
  let payload: unknown; try { payload = await req.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  const record = (payload ?? {}) as Record<string, unknown>;
  const admin = createAdminSupabaseClient();
  let query = admin.from("founder_notifications").update({ read_at: new Date().toISOString() }).eq("user_id", user.id).eq("in_app_visible", true).is("read_at", null);
  if (record.action !== "read_all") { if (typeof record.notificationId !== "string") return NextResponse.json({ error: "Invalid notification." }, { status: 400 }); query = query.eq("id", record.notificationId); }
  const { error } = await query;
  if (error) return NextResponse.json({ error: "Could not update notification." }, { status: 500 });
  return NextResponse.json({ success: true });
}

