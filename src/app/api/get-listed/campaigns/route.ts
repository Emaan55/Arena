import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createRouteHandlerSupabaseClient } from "@/lib/supabase/server";
import { GET_LISTED_PACKAGES, isGetListedPackageKey } from "@/lib/get-listed/packages";
import { CATEGORIES, type Category } from "@/types/database";

const NAME_MAX = 80;
const DESCRIPTION_MAX = 500;
const URL_MAX = 300;

function normalizedOrNull(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max) return null;
  return trimmed;
}

/**
 * Both routes require a signed-in Supabase user — obtained from the
 * verified session (getUser() re-checks the token against Supabase's Auth
 * server), never from anything the client sends. Actual reads/writes go
 * through the service-role admin client (campaigns/submissions have zero
 * RLS policies for the authenticated role — see migration 0015), exactly
 * like every other mutable table in this app.
 */
export async function POST(req: NextRequest) {
  const supabaseAuth = await createRouteHandlerSupabaseClient();
  const {
    data: { user },
  } = await supabaseAuth.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in to create a campaign." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const record = (body ?? {}) as Record<string, unknown>;

  const packageKey = record.packageKey;
  if (!isGetListedPackageKey(packageKey)) {
    return NextResponse.json({ error: "Invalid package." }, { status: 400 });
  }

  const startupName = typeof record.startupName === "string" ? record.startupName.trim() : "";
  if (!startupName || startupName.length > NAME_MAX) {
    return NextResponse.json({ error: `Startup name is required (max ${NAME_MAX} characters).` }, { status: 400 });
  }

  const websiteUrl = normalizedOrNull(record.websiteUrl, URL_MAX);
  if (!websiteUrl) {
    return NextResponse.json({ error: "A valid website URL is required." }, { status: 400 });
  }

  const description = typeof record.description === "string" ? record.description.trim() : "";
  if (!description || description.length > DESCRIPTION_MAX) {
    return NextResponse.json(
      { error: `A description is required (max ${DESCRIPTION_MAX} characters).` },
      { status: 400 },
    );
  }

  const category = record.category;
  if (!CATEGORIES.includes(category as Category)) {
    return NextResponse.json({ error: "Invalid category." }, { status: 400 });
  }

  if (record.termsAccepted !== true) {
    return NextResponse.json({ error: "You must accept the submission terms to continue." }, { status: 400 });
  }

  // Never trust a client-submitted target/price — always re-resolved here
  // from the server-side package config by key.
  const pkg = GET_LISTED_PACKAGES[packageKey];

  const admin = createAdminSupabaseClient();
  const { data: campaign, error } = await admin
    .from("campaigns")
    .insert({
      owner_id: user.id,
      startup_name: startupName,
      website_url: websiteUrl,
      description,
      category: category as Category,
      x_url: normalizedOrNull(record.xUrl, URL_MAX),
      linkedin_url: normalizedOrNull(record.linkedinUrl, URL_MAX),
      other_url: normalizedOrNull(record.otherUrl, URL_MAX),
      package_key: pkg.key,
      submission_target: pkg.target,
      // No payment flow yet (Phase 1) — this honestly reflects that
      // nothing has been paid or fulfilled yet, rather than inventing a
      // fake "active" state. See PATCH /api/admin/get-listed/campaigns/[id]
      // for how an admin currently moves this forward by hand.
      status: "awaiting_payment",
      terms_accepted_at: new Date().toISOString(),
    })
    .select("*")
    .single();

  if (error || !campaign) {
    return NextResponse.json({ error: "Could not create campaign." }, { status: 500 });
  }

  return NextResponse.json({ campaign }, { status: 201 });
}

export async function GET() {
  const supabaseAuth = await createRouteHandlerSupabaseClient();
  const {
    data: { user },
  } = await supabaseAuth.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in to view your campaigns." }, { status: 401 });
  }

  const admin = createAdminSupabaseClient();
  const { data: campaigns } = await admin
    .from("campaigns")
    .select("*")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false });

  const ids = (campaigns ?? []).map((c) => c.id);
  const counts: Record<string, number> = {};
  if (ids.length > 0) {
    const { data: rows } = await admin.from("submissions").select("campaign_id").in("campaign_id", ids);
    for (const row of rows ?? []) {
      counts[row.campaign_id] = (counts[row.campaign_id] ?? 0) + 1;
    }
  }

  const withProgress = (campaigns ?? []).map((c) => ({ ...c, submission_count: counts[c.id] ?? 0 }));
  return NextResponse.json({ campaigns: withProgress });
}
