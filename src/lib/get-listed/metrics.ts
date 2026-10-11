import type { CampaignDeliverableKind } from "@/types/database";

export const CAMPAIGN_METRIC_FIELDS = [
  { key: "views", label: "Views" },
  { key: "impressions", label: "Impressions" },
  { key: "clicks", label: "Link clicks" },
  { key: "likes", label: "Likes / reactions" },
  { key: "comments", label: "Comments" },
  { key: "shares", label: "Shares / reposts" },
  { key: "watch_time_minutes", label: "Watch time (minutes)" },
] as const;

export type CampaignMetricKey = (typeof CAMPAIGN_METRIC_FIELDS)[number]["key"];

export const CAMPAIGN_METRIC_KEYS = new Set<string>(CAMPAIGN_METRIC_FIELDS.map((field) => field.key));

export function getDeliverablePlatform(kind: CampaignDeliverableKind): string {
  switch (kind) {
    case "x_post":
      return "X";
    case "linkedin_post":
      return "LinkedIn";
    case "youtube_video":
    case "youtube_short":
      return "YouTube";
    case "showcase":
      return "The Arena";
    case "directory":
      return "Directories";
    case "graphic":
      return "Creative asset";
    case "strategy":
      return "Distribution research";
    case "update":
    case "report":
      return "Campaign report";
  }
}

export function metricNumber(value: string | number | undefined): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value !== "string" || value.trim() === "") return 0;
  const parsed = Number(value.replaceAll(",", ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function formatMetricLabel(key: string): string {
  const known = CAMPAIGN_METRIC_FIELDS.find((field) => field.key === key);
  if (known) return known.label;
  return key.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

