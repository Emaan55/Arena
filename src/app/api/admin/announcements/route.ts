import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { isAuthorizedAdmin } from "@/lib/admin-auth";
export async function GET(req: NextRequest) {
  if (!isAuthorizedAdmin(req)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin.from("arena_announcements").select("*").order("created_at", { ascending: false }).limit(50);
  if (error) return NextResponse.json({ error: "Could not load announcements." }, { status: 500 });
  const { data: latest } = await admin.from("founder_notifications").select("event_key,created_at").eq("event_type", "weekly_announcement_digest").order("created_at", { ascending: false }).limit(1).maybeSingle();
  let weeklyDelivery: { weekStart: string; queued: number; sending: number; sent: number; failed: number; skipped: number } | null = null;
  if (latest) {
    const { data: jobs } = await admin.from("founder_notifications").select("email_status").eq("event_key", latest.event_key);
    weeklyDelivery = { weekStart: latest.event_key.replace("weekly-announcement-digest:", ""), queued: 0, sending: 0, sent: 0, failed: 0, skipped: 0 };
    for (const job of jobs ?? []) if (job.email_status in weeklyDelivery) weeklyDelivery[job.email_status as keyof Omit<typeof weeklyDelivery, "weekStart">]++;
  }
  return NextResponse.json({ announcements: data ?? [], weeklyDelivery });
}
export async function POST(req: NextRequest) {
  if (!isAuthorizedAdmin(req)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  let body: unknown; try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  const record = (body ?? {}) as Record<string, unknown>;
  const title = typeof record.title === "string" ? record.title.trim() : "";
  const text = typeof record.body === "string" ? record.body.trim() : "";
  if (!title || title.length > 140 || !text || text.length > 5000 || typeof record.emailRequested !== "boolean") return NextResponse.json({ error: "Enter a title (max 140 characters), body (max 5,000), and email choice." }, { status: 400 });
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin.from("arena_announcements").insert({ title, body: text, email_requested: record.emailRequested, status: "draft" }).select().single();
  if (error) return NextResponse.json({ error: "Could not save announcement draft." }, { status: 500 });
  return NextResponse.json({ announcement: data }, { status: 201 });
}
export async function PATCH(req: NextRequest) {
  if (!isAuthorizedAdmin(req)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  let body: unknown; try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  const record = (body ?? {}) as Record<string, unknown>;
  if (typeof record.id !== "string" || record.action !== "publish") return NextResponse.json({ error: "Invalid publish request." }, { status: 400 });
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin.from("arena_announcements").update({ status: "published" }).eq("id", record.id).eq("status", "draft").select().maybeSingle();
  if (error) return NextResponse.json({ error: "Could not publish announcement." }, { status: 500 });
  if (!data) return NextResponse.json({ error: "This announcement was already published or no longer exists." }, { status: 409 });
  return NextResponse.json({ announcement: data });
}

