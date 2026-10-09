import "server-only";
import { after } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, FounderNotification, ProductAnalyticsDaily } from "@/types/database";
import { createUnsubscribeToken, escapeEmailHtml, isEmailAllowed } from "@/lib/founder-notification-core";

function renderEmail(job: FounderNotification, href: string, unsubscribeUrl: string | null) {
  const title = escapeEmailHtml(job.title);
  const body = escapeEmailHtml(job.body).replace(/\n/g, "<br>");
  const base = (process.env.NEXT_PUBLIC_SITE_URL || "https://www.thearena.lol").replace(/\/$/, "");
  const footer = unsubscribeUrl
    ? `You received this optional Arena update because of your email preferences. <a href="${escapeEmailHtml(unsubscribeUrl)}">Unsubscribe from this category</a> · <a href="${base}/dashboard/settings">Preferences</a>`
    : `This is an essential account update. Manage other email preferences in your <a href="${base}/dashboard/settings">dashboard</a>.`;
  return `<!doctype html><html><body style="margin:0;background:#f4f4f5;font-family:Arial,sans-serif;color:#18181b"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:32px 12px"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:white;border:1px solid #e4e4e7;border-radius:16px"><tr><td style="padding:22px 28px;background:#09090b;color:white;font-weight:bold;letter-spacing:2px">THE ARENA</td></tr><tr><td style="padding:30px 28px"><h1 style="font-size:24px">${title}</h1><p style="font-size:16px;line-height:1.7;color:#52525b">${body}</p><p style="margin:24px 0"><a href="${escapeEmailHtml(href)}" style="display:inline-block;padding:12px 18px;border-radius:9px;background:#00b4d8;color:#071116;text-decoration:none;font-weight:bold">Open The Arena</a></p><p style="color:#71717a;font-size:12px;line-height:1.6">${footer}</p></td></tr></table></td></tr></table></body></html>`;
}

export async function deliverFounderNotificationBatch(admin: SupabaseClient<Database>, limit = 20) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.ARENA_EMAIL_FROM;
  if (!apiKey || !from || !process.env.NOTIFICATION_UNSUBSCRIBE_SECRET) return { claimed: 0, sent: 0, failed: 0, configured: false };
  const { data: jobs, error } = await admin.rpc("claim_founder_notification_emails", { p_limit: limit });
  if (error || !jobs) return { claimed: 0, sent: 0, failed: 0, configured: true };
  let sent = 0;
  let failed = 0;
  for (let offset = 0; offset < jobs.length; offset += 5) {
    await Promise.all(jobs.slice(offset, offset + 5).map(async (job) => {
    try {
      const { data: profile } = await admin.auth.admin.getUserById(job.user_id);
      if (!profile.user?.email) throw new Error("Account email is unavailable");
      const { data: prefs } = await admin.from("founder_notification_preferences").select("*").eq("user_id", job.user_id).maybeSingle();
      if (!isEmailAllowed(job.email_category, prefs as Record<string, boolean> | null)) {
        await admin.from("founder_notifications").update({ email_status: "skipped", email_locked_at: null, email_last_error: null }).eq("id", job.id);
        return;
      }
      const base = (process.env.NEXT_PUBLIC_SITE_URL || "https://www.thearena.lol").replace(/\/$/, "");
      const href = new URL(job.href.startsWith("/") ? job.href : "/dashboard", base).toString();
      const optional = job.email_category !== "transactional";
      const unsubscribeUrl = optional ? new URL(`/unsubscribe?token=${encodeURIComponent(createUnsubscribeToken(job.user_id, job.email_category))}`, base).toString() : null;
      const headers: Record<string, string> = {};
      if (unsubscribeUrl) {
        headers["List-Unsubscribe"] = `<${unsubscribeUrl}>`;
        headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
      }
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": `arena-notification/${job.id}` },
        body: JSON.stringify({ from, to: [profile.user.email], subject: job.title, html: renderEmail(job, href, unsubscribeUrl), ...(process.env.ARENA_EMAIL_REPLY_TO ? { reply_to: process.env.ARENA_EMAIL_REPLY_TO } : {}), ...(Object.keys(headers).length ? { headers } : {}) }),
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) throw new Error(`Resend returned HTTP ${response.status}`);
      await admin.from("founder_notifications").update({ email_status: "sent", email_sent_at: new Date().toISOString(), email_locked_at: null, email_last_error: null }).eq("id", job.id).eq("email_status", "sending");
      sent++;
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 300) : "Unknown email delivery error";
      const attempts = job.email_attempts;
      const retry = new Date(Date.now() + Math.min(12 * 60 * 60 * 1000, 60_000 * (2 ** Math.min(attempts, 9)))).toISOString();
      await admin.from("founder_notifications").update({ email_status: attempts >= 8 ? "failed" : "queued", email_locked_at: null, email_next_attempt_at: retry, email_last_error: message }).eq("id", job.id).eq("email_status", "sending");
      failed++;
    }
    }));
  }
  return { claimed: jobs.length, sent, failed, configured: true };
}

export function scheduleFounderNotificationDelivery() {
  try {
    after(async () => {
      try {
        const { createAdminSupabaseClient } = await import("@/lib/supabase/admin");
        await deliverFounderNotificationBatch(createAdminSupabaseClient());
      } catch (error) { console.error("Founder notification delivery wake-up failed", error); }
    });
  } catch { /* queued rows remain available to the scheduled recovery worker */ }
}

export async function getProductAnalyticsSummary(admin: SupabaseClient<Database>, productIds: string[]): Promise<Record<string, ProductAnalyticsDaily>> {
  if (!productIds.length) return {};
  const { data, error } = await admin.rpc("get_product_analytics", { p_product_ids: productIds });
  if (error || !data) return {};
  return Object.fromEntries(data.map((row) => [row.product_id, row]));
}
