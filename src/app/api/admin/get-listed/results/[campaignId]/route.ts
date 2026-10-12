import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedAdmin } from "@/lib/admin-auth";
import { logAdminAction } from "@/lib/get-listed/audit";
import {
  CAMPAIGN_RESULT_PLATFORMS,
  isValidPlatformUrl,
  parseSafeHttpUrl,
  type CampaignResultPlatformName,
} from "@/lib/get-listed/campaign-results";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

const NAME_MAX = 100;
const URL_MAX = 700;
const PACKAGE_MAX = 100;
const MAX_PLATFORM_ENTRIES = 20;

function dateValue(value: unknown): string | null | undefined {
  if (value === null || value === "" || value === undefined) return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    return undefined;
  }
  return value;
}

function optionalSafeUrl(value: unknown): string | null | undefined {
  if (value === null || value === "" || value === undefined) return null;
  if (typeof value !== "string" || value.length > URL_MAX) return undefined;
  const parsed = parseSafeHttpUrl(value.trim());
  return parsed?.toString();
}

async function loadCampaignResult(campaignId: string) {
  const admin = createAdminSupabaseClient();
  const [{ data: campaign }, { data: result, error: resultError }] = await Promise.all([
    admin
      .from("campaigns")
      .select("id,startup_name,website_url,package_label,campaign_duration_days,status,deleted_at")
      .eq("id", campaignId)
      .maybeSingle(),
    admin.from("campaign_results").select("*").eq("campaign_id", campaignId).maybeSingle(),
  ]);
  if (!campaign) return { status: 404 as const, error: "Campaign not found." };
  if (resultError) return { status: 503 as const, error: "Campaign Results is not ready. Apply migration 0029 first." };

  const { data: platforms, error: platformError } = result
    ? await admin
        .from("campaign_result_platforms")
        .select("*")
        .eq("campaign_result_id", result.id)
        .order("position", { ascending: true })
        .order("created_at", { ascending: true })
    : { data: [], error: null };
  if (platformError) return { status: 500 as const, error: "Could not load platform results." };
  return { status: 200 as const, campaign, result: result ? { ...result, platforms: platforms ?? [] } : null };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ campaignId: string }> }) {
  if (!isAuthorizedAdmin(req)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const { campaignId } = await params;
  const loaded = await loadCampaignResult(campaignId);
  if (loaded.error) return NextResponse.json({ error: loaded.error }, { status: loaded.status });
  return NextResponse.json({ campaign: loaded.campaign, result: loaded.result });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ campaignId: string }> }) {
  if (!isAuthorizedAdmin(req)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const { campaignId } = await params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const record = (body ?? {}) as Record<string, unknown>;
  const productName = typeof record.productName === "string" ? record.productName.trim() : "";
  const packageLabel = typeof record.packageLabel === "string" ? record.packageLabel.trim() : "";
  const websiteUrl = optionalSafeUrl(record.websiteUrl);
  const logoUrl = optionalSafeUrl(record.logoUrl);
  const drEvidenceUrl = optionalSafeUrl(record.drEvidenceUrl);
  const isPublished = record.isPublished === true;
  const adminName = typeof record.adminName === "string" ? record.adminName.trim().slice(0, 80) : "admin";

  if (!productName || productName.length > NAME_MAX) return NextResponse.json({ error: "Product name is required and must be 100 characters or fewer." }, { status: 400 });
  if (!packageLabel || packageLabel.length > PACKAGE_MAX) return NextResponse.json({ error: "Package name is required and must be 100 characters or fewer." }, { status: 400 });
  if (!websiteUrl) return NextResponse.json({ error: "Product website must be a safe HTTP or HTTPS URL." }, { status: 400 });
  if (logoUrl === undefined) return NextResponse.json({ error: "Logo must be a safe HTTP or HTTPS URL." }, { status: 400 });
  if (drEvidenceUrl === undefined) return NextResponse.json({ error: "DR evidence must be a safe HTTP or HTTPS URL." }, { status: 400 });

  let duration: number | null = null;
  if (record.campaignDurationDays !== null && record.campaignDurationDays !== "" && record.campaignDurationDays !== undefined) {
    duration = Number(record.campaignDurationDays);
    if (!Number.isInteger(duration) || duration <= 0 || duration > 3650) return NextResponse.json({ error: "Campaign duration must be a positive number of days." }, { status: 400 });
  }

  let domainRating: number | null = null;
  if (record.domainRating !== null && record.domainRating !== "" && record.domainRating !== undefined) {
    domainRating = Number(record.domainRating);
    if (!Number.isFinite(domainRating) || domainRating < 0 || domainRating > 100) return NextResponse.json({ error: "Domain Rating must be between 0 and 100." }, { status: 400 });
  }
  const drRecordedAt = dateValue(record.drRecordedAt);
  if (drRecordedAt === undefined) return NextResponse.json({ error: "Enter a valid DR measurement date." }, { status: 400 });
  if ((domainRating === null) !== (drRecordedAt === null)) return NextResponse.json({ error: "Domain Rating and its Ahrefs measurement date must be entered together." }, { status: 400 });

  const rawPlatforms = Array.isArray(record.platforms) ? record.platforms : [];
  if (rawPlatforms.length > MAX_PLATFORM_ENTRIES) return NextResponse.json({ error: `Add no more than ${MAX_PLATFORM_ENTRIES} platform results.` }, { status: 400 });
  const platforms: Array<Record<string, string | number | null>> = [];
  const seenUrls = new Set<string>();

  for (let index = 0; index < rawPlatforms.length; index += 1) {
    const item = (rawPlatforms[index] ?? {}) as Record<string, unknown>;
    const platform = item.platform as CampaignResultPlatformName;
    const publishedUrl = typeof item.publishedUrl === "string" ? item.publishedUrl.trim() : "";
    if (!CAMPAIGN_RESULT_PLATFORMS.includes(platform)) return NextResponse.json({ error: `Platform result ${index + 1} uses an unsupported platform.` }, { status: 400 });
    if (publishedUrl.length > URL_MAX || !isValidPlatformUrl(platform, publishedUrl)) return NextResponse.json({ error: `Platform result ${index + 1} needs a valid published ${platform === "x" ? "X" : platform} post URL.` }, { status: 400 });
    const normalizedUrl = new URL(publishedUrl).toString();
    if (seenUrls.has(normalizedUrl.toLowerCase())) return NextResponse.json({ error: "The same published link cannot be added twice." }, { status: 400 });
    seenUrls.add(normalizedUrl.toLowerCase());

    let views: number | null = null;
    if (item.views !== null && item.views !== "" && item.views !== undefined) {
      views = Number(item.views);
      if (!Number.isSafeInteger(views) || views < 0) return NextResponse.json({ error: `Views for platform result ${index + 1} must be a whole number of zero or more.` }, { status: 400 });
    }
    let viewsRecordedAt = dateValue(item.viewsRecordedAt);
    if (viewsRecordedAt === undefined) return NextResponse.json({ error: `Enter a valid views date for platform result ${index + 1}.` }, { status: 400 });
    if (views !== null && viewsRecordedAt === null) return NextResponse.json({ error: `Add the date when views were recorded for platform result ${index + 1}.` }, { status: 400 });
    if (views === null) viewsRecordedAt = null;
    const evidenceUrl = optionalSafeUrl(item.evidenceUrl);
    if (evidenceUrl === undefined) return NextResponse.json({ error: `Evidence link ${index + 1} must be a safe HTTP or HTTPS URL.` }, { status: 400 });
    platforms.push({
      platform,
      published_url: normalizedUrl,
      views,
      views_recorded_at: viewsRecordedAt,
      evidence_url: evidenceUrl,
    });
  }

  if (isPublished && domainRating === null && platforms.length === 0) {
    return NextResponse.json({ error: "Add a real platform result or an Ahrefs Domain Rating before publishing." }, { status: 400 });
  }

  const loaded = await loadCampaignResult(campaignId);
  if (loaded.error) return NextResponse.json({ error: loaded.error }, { status: loaded.status });
  if (!loaded.campaign) return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
  if (loaded.campaign.deleted_at) return NextResponse.json({ error: "Restore the campaign before publishing its results." }, { status: 409 });
  const wasPublished = loaded.result?.is_published === true;

  const admin = createAdminSupabaseClient();
  const { error } = await admin.rpc("save_campaign_result", {
    p_campaign_id: campaignId,
    p_product_name: productName,
    p_logo_url: logoUrl,
    p_website_url: websiteUrl,
    p_package_label: packageLabel,
    p_campaign_duration_days: duration,
    p_domain_rating: domainRating,
    p_dr_recorded_at: drRecordedAt,
    p_dr_evidence_url: drEvidenceUrl,
    p_is_published: isPublished,
    p_platforms: platforms,
  });
  if (error) return NextResponse.json({ error: "Could not save campaign results. Apply migration 0029 and try again." }, { status: 500 });

  await logAdminAction(admin, {
    campaignId,
    action: isPublished ? (wasPublished ? "campaign_result_updated" : "campaign_result_published") : wasPublished ? "campaign_result_unpublished" : "campaign_result_saved",
    adminIdentifier: adminName || "admin",
    metadata: { platform_count: platforms.length, has_domain_rating: domainRating !== null },
  });

  const saved = await loadCampaignResult(campaignId);
  if (saved.error) return NextResponse.json({ error: saved.error }, { status: saved.status });
  return NextResponse.json({ campaign: saved.campaign, result: saved.result });
}
