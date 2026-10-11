import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createRouteHandlerSupabaseClient } from "@/lib/supabase/server";
import { GET_LISTED_PACKAGES, isCurrentGetListedPackageKey } from "@/lib/get-listed/packages";
import { CATEGORIES, type Category } from "@/types/database";

const NAME_MAX = 80;
const DESCRIPTION_MAX = 500;
const URL_MAX = 300;
const AUDIENCE_MAX = 300;
const DEMO_NOTES_MAX = 1000;

function normalizedOrNull(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max) return null;
  return trimmed;
}

function normalizedHttpUrlOrNull(value: unknown): string | null {
  const normalized = normalizedOrNull(value, URL_MAX);
  if (!normalized) return null;
  try {
    const url = new URL(normalized);
    return url.protocol === "https:" || url.protocol === "http:" ? normalized : null;
  } catch {
    return null;
  }
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
  if (!isCurrentGetListedPackageKey(packageKey)) {
    return NextResponse.json({ error: "Invalid package." }, { status: 400 });
  }

  const startupName = typeof record.startupName === "string" ? record.startupName.trim() : "";
  if (!startupName || startupName.length > NAME_MAX) {
    return NextResponse.json({ error: `Startup name is required (max ${NAME_MAX} characters).` }, { status: 400 });
  }

  const websiteUrl = normalizedHttpUrlOrNull(record.websiteUrl);
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

  const targetAudience = normalizedOrNull(record.targetAudience, AUDIENCE_MAX);
  if (!targetAudience) {
    return NextResponse.json({ error: `Target audience is required (max ${AUDIENCE_MAX} characters).` }, { status: 400 });
  }

  if (record.termsAccepted !== true) {
    return NextResponse.json({ error: "You must accept the submission terms to continue." }, { status: 400 });
  }

  // Never trust a client-submitted target/price — always re-resolved here
  // from the server-side package config by key.
  const pkg = GET_LISTED_PACKAGES[packageKey];

  const admin = createAdminSupabaseClient();

  // Optional Discount Drop award — re-validated here from scratch (owned
  // by this user, still "available", not expired) rather than trusting
  // anything the client claims about it, exactly like every other
  // server-side eligibility check in this app. An invalid/expired/foreign
  // award id is a hard error rather than being silently dropped, so the
  // UI can tell the founder their discount didn't apply instead of
  // quietly charging full price.
  let discountAwardId: string | null = null;
  let discountPercent: number | null = null;
  if (typeof record.discountAwardId === "string" && record.discountAwardId) {
    const { data: award } = await admin
      .from("discount_awards")
      .select("id, discount_percent, status, expires_at")
      .eq("id", record.discountAwardId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!award || award.status !== "available" || new Date(award.expires_at).getTime() <= Date.now()) {
      return NextResponse.json(
        { error: "Your discount has expired. Play Discount Drop again to earn a new discount." },
        { status: 400 },
      );
    }
    discountAwardId = award.id;
    discountPercent = award.discount_percent;
  }

  const { data: campaign, error } = await admin
    .from("campaigns")
    .insert({
      owner_id: user.id,
      startup_name: startupName,
      website_url: websiteUrl,
      description,
      category: category as Category,
      x_url: normalizedHttpUrlOrNull(record.xUrl),
      linkedin_url: normalizedHttpUrlOrNull(record.linkedinUrl),
      other_url: normalizedHttpUrlOrNull(record.otherUrl),
      package_key: pkg.key,
      package_label: pkg.label,
      package_version: pkg.version,
      submission_target: pkg.target,
      campaign_duration_days: pkg.durationDays,
      target_audience: targetAudience,
      demo_access_notes: normalizedOrNull(record.demoAccessNotes, DEMO_NOTES_MAX),
      status: "awaiting_payment",
      terms_accepted_at: new Date().toISOString(),
      discount_award_id: discountAwardId,
      discount_percent: discountPercent,
    })
    .select("*")
    .single();

  if (error || !campaign) {
    return NextResponse.json({ error: "Could not create campaign." }, { status: 500 });
  }

  const { error: deliverablesError } = await admin.from("campaign_deliverables").insert(
    pkg.deliverables.map((item, position) => ({
      campaign_id: campaign.id,
      deliverable_key: item.key,
      kind: item.kind,
      title: item.title,
      purpose: item.purpose,
      position,
      status: "pending" as const,
    })),
  );

  if (deliverablesError) {
    // The campaign is still unpaid, so roll it back instead of leaving an
    // incomplete fulfillment record. No discount is linked until after this.
    await admin.from("campaigns").delete().eq("id", campaign.id).eq("owner_id", user.id);
    return NextResponse.json(
      { error: "Campaign fulfillment is not configured yet. Apply migration 0027 and try again." },
      { status: 503 },
    );
  }

  if (discountAwardId) {
    // Links the award to what it was used for; actually marking it
    // "redeemed" happens at payment time, a LemonSqueezy-phase concern.
    await admin.from("discount_awards").update({ campaign_id: campaign.id }).eq("id", discountAwardId);
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

