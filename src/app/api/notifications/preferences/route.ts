import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createRouteHandlerSupabaseClient } from "@/lib/supabase/server";
const ALLOWED = ["important_duel_updates", "review_notifications", "daily_vote_digest", "product_announcements", "get_listed_updates"] as const;
export async function GET() {
  const auth = await createRouteHandlerSupabaseClient(); const { data: { user } } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in to view preferences." }, { status: 401 });
  const admin = createAdminSupabaseClient();
  const { error: insertError } = await admin.from("founder_notification_preferences").upsert({ user_id: user.id }, { onConflict: "user_id", ignoreDuplicates: true });
  if (insertError) return NextResponse.json({ error: "Could not load preferences." }, { status: 500 });
  const { data, error } = await admin.from("founder_notification_preferences").select("*").eq("user_id", user.id).maybeSingle();
  if (error || !data) return NextResponse.json({ error: "Could not load preferences." }, { status: 500 });
  return NextResponse.json({ preferences: data });
}
export async function PATCH(req: NextRequest) {
  const auth = await createRouteHandlerSupabaseClient(); const { data: { user } } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in to update preferences." }, { status: 401 });
  let payload: unknown; try { payload = await req.json(); } catch { return NextResponse.json({ error: "Invalid preferences." }, { status: 400 }); }
  const record = (payload ?? {}) as Record<string, unknown>; const update: Record<string, boolean> = {};
  for (const key of ALLOWED) if (key in record) { if (typeof record[key] !== "boolean") return NextResponse.json({ error: "Preferences must be true or false." }, { status: 400 }); update[key] = record[key] as boolean; }
  if (!Object.keys(update).length) return NextResponse.json({ error: "No preferences supplied." }, { status: 400 });
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin.from("founder_notification_preferences").upsert({ user_id: user.id, ...update, updated_at: new Date().toISOString() }).select().single();
  if (error) return NextResponse.json({ error: "Could not save preferences." }, { status: 500 });
  return NextResponse.json({ preferences: data });
}
