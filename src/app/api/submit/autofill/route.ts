import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerSupabaseClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/fingerprint";
import { autofillProduct } from "@/lib/product-autofill";
import { parsePublicWebsiteUrl } from "@/lib/safe-fetch";

export const runtime = "nodejs";
export const maxDuration = 20;
const response = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (origin) { try { if (new URL(origin).origin !== req.nextUrl.origin) return response({ error: "Invalid request origin." }, 403); } catch { return response({ error: "Invalid request origin." }, 403); } }
  if (!rateLimit(`autofill-ip:${getClientIp(req)}`, 20, 60_000)) return response({ error: "Too many requests. Try again shortly." }, 429);
  const auth = await createRouteHandlerSupabaseClient();
  const { data: { user }, error } = await auth.auth.getUser();
  if (error || !user) return response({ error: "Sign in to auto-fill your product." }, 401);
  if (!rateLimit(`autofill-user:${user.id}`, 6, 60_000) || !rateLimit(`autofill-hour:${user.id}`, 30, 3600_000)) return response({ error: "Auto-fill limit reached. Try again later or enter details manually." }, 429);
  let url: string;
  try {
    if (!req.body || Number(req.headers.get("content-length") ?? 0) > 4096) return response({ error: "Request is too large." }, 413);
    const reader = req.body.getReader(); let text = ""; let bytes = 0; const decoder = new TextDecoder();
    try { while (true) { const chunk = await reader.read(); if (chunk.done) break; bytes += chunk.value.length; if (bytes > 4096) return response({ error: "Request is too large." }, 413); text += decoder.decode(chunk.value, { stream: true }); } }
    finally { await reader.cancel().catch(() => {}); }
    const body = JSON.parse(text);
    if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).join(",") !== "url") throw new Error("Invalid request.");
    url = parsePublicWebsiteUrl(body.url).toString();
  } catch { return response({ error: "Enter a public website URL without credentials, query parameters or custom ports." }, 400); }
  try { return response(await autofillProduct(url, user.id)); }
  catch { return response({ error: "We couldn't read this website safely. You can still enter your details manually." }, 422); }
}
