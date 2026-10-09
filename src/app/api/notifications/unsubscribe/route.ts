import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { FounderNotificationPreferences } from "@/types/database";
import { verifyUnsubscribeToken } from "@/lib/founder-notification-core";
export async function POST(req: NextRequest) {
  let payload: Record<string, unknown>;
  try { const type = req.headers.get("content-type") ?? ""; payload = type.includes("application/x-www-form-urlencoded") ? Object.fromEntries(new URLSearchParams(await req.text())) : await req.json() as Record<string, unknown>; }
  catch { return NextResponse.json({ error: "Invalid unsubscribe request." }, { status: 400 }); }
  const verified = verifyUnsubscribeToken(typeof payload.token === "string" ? payload.token : req.nextUrl.searchParams.get("token") ?? "");
  if (!verified) return NextResponse.json({ error: "This unsubscribe link is invalid." }, { status: 400 });
  const admin = createAdminSupabaseClient();
  const update: Partial<FounderNotificationPreferences> = { updated_at: new Date().toISOString() };
  switch (verified.category) {
    case "duel": update.important_duel_updates = false; break;
    case "review": update.review_notifications = false; break;
    case "digest": update.daily_vote_digest = false; break;
    case "announcement": update.product_announcements = false; break;
    case "get_listed": update.get_listed_updates = false; break;
  }
  const { error } = await admin.from("founder_notification_preferences").upsert({ user_id: verified.userId, ...update });
  if (error) return NextResponse.json({ error: "Could not update preferences." }, { status: 500 });
  return NextResponse.json({ success: true, category: verified.category });
}
