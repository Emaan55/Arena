import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { deliverFounderNotificationBatch } from "@/lib/founder-notifications";
export const maxDuration = 60;
function authorized(req: NextRequest) { const secret = process.env.CRON_SECRET; const got = Buffer.from(req.headers.get("authorization") ?? ""); const expected = Buffer.from(`Bearer ${secret ?? ""}`); return Boolean(secret && got.length === expected.length && timingSafeEqual(got, expected)); }
export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const admin = createAdminSupabaseClient(); const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  const now = new Date();
  const mondayOffset = (now.getUTCDay() + 6) % 7;
  const currentWeekStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - mondayOffset));
  const previousWeekStart = new Date(currentWeekStart.getTime() - 7 * 86_400_000).toISOString().slice(0, 10);
  const weeklyRequest = now.getUTCDay() === 1
    ? admin.rpc("create_weekly_announcement_digests", { p_week_start: previousWeekStart })
    : Promise.resolve({ data: 0, error: null });
  const [digests, weeklyAnnouncements, reminders, retention] = await Promise.all([admin.rpc("create_daily_vote_digests", { p_day: yesterday }), weeklyRequest, admin.rpc("create_waiting_product_reminders", { p_day: yesterday }), admin.rpc("prune_product_analytics", { p_unique_before: new Date(Date.now() - 400 * 86_400_000).toISOString().slice(0, 10) })]);
  const delivery = await deliverFounderNotificationBatch(admin, 50);
  return NextResponse.json({ digestJobs: digests.data ?? 0, weeklyAnnouncementJobs: weeklyAnnouncements.data ?? 0, waitingReminders: reminders.data ?? 0, delivery, errors: [digests.error?.message, weeklyAnnouncements.error?.message, reminders.error?.message, retention.error?.message].filter(Boolean) });
}

