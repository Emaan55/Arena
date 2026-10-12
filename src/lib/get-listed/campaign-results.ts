export const CAMPAIGN_RESULT_PLATFORMS = ["youtube", "linkedin", "x"] as const;
export type CampaignResultPlatformName = (typeof CAMPAIGN_RESULT_PLATFORMS)[number];

export type CampaignResultPlatform = {
  id: string;
  campaign_result_id: string;
  platform: CampaignResultPlatformName;
  published_url: string;
  views: number | null;
  views_recorded_at: string | null;
  evidence_url: string | null;
  position: number;
  created_at: string;
  updated_at: string;
};

export type CampaignResult = {
  id: string;
  campaign_id: string;
  product_name: string;
  logo_url: string | null;
  website_url: string;
  package_label: string;
  campaign_duration_days: number | null;
  domain_rating: number | null;
  dr_source: "Ahrefs";
  dr_recorded_at: string | null;
  dr_evidence_url: string | null;
  is_published: boolean;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

export type CampaignResultWithPlatforms = CampaignResult & {
  platforms: CampaignResultPlatform[];
};

export const PLATFORM_LABELS: Record<CampaignResultPlatformName, string> = {
  youtube: "YouTube",
  linkedin: "LinkedIn",
  x: "X",
};

const PLATFORM_HOSTS: Record<CampaignResultPlatformName, readonly string[]> = {
  youtube: ["youtube.com", "youtu.be"],
  linkedin: ["linkedin.com"],
  x: ["x.com", "twitter.com"],
};

function hostMatches(hostname: string, allowed: readonly string[]) {
  const normalized = hostname.toLowerCase().replace(/\.$/, "");
  return allowed.some((host) => normalized === host || normalized.endsWith(`.${host}`));
}

export function parseSafeHttpUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (url.username || url.password) return null;
    return url;
  } catch {
    return null;
  }
}

export function isValidPlatformUrl(platform: CampaignResultPlatformName, value: string): boolean {
  const url = parseSafeHttpUrl(value);
  if (!url || !hostMatches(url.hostname, PLATFORM_HOSTS[platform])) return false;

  if (platform === "youtube") {
    if (url.hostname.toLowerCase().replace(/\.$/, "").endsWith("youtu.be")) {
      return url.pathname.split("/").filter(Boolean).length >= 1;
    }
    return (
      (url.pathname === "/watch" && Boolean(url.searchParams.get("v"))) ||
      /^\/(shorts|live|embed)\/[^/]+/.test(url.pathname)
    );
  }
  if (platform === "linkedin") {
    return /^\/(posts|feed\/update|pulse)\//.test(url.pathname);
  }
  return /^\/[^/]+\/status\/\d+/.test(url.pathname);
}

export function combinedReportedViews(platforms: CampaignResultPlatform[]): number {
  return platforms.reduce((total, entry) => total + (typeof entry.views === "number" ? entry.views : 0), 0);
}
