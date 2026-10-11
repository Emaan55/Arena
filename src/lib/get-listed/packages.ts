/**
 * Server-authoritative Get Listed package catalog.
 *
 * The original directory-only keys remain here permanently so historical
 * campaigns and pending checkouts keep their original names, targets, and
 * prices. New promotion campaigns use new keys and snapshot their work items
 * into campaign_deliverables when the campaign is created.
 */

export type CampaignDeliverableKind =
  | "directory"
  | "x_post"
  | "linkedin_post"
  | "youtube_video"
  | "youtube_short"
  | "graphic"
  | "showcase"
  | "strategy"
  | "update"
  | "report";

export type CampaignDeliverableTemplate = {
  key: string;
  kind: CampaignDeliverableKind;
  title: string;
  purpose: string;
};

type GetListedPackageDefinition = {
  key: string;
  label: string;
  arenaName: string;
  target: number;
  priceUsd: number;
  durationDays: number | null;
  version: number;
  legacy: boolean;
  deliverables: readonly CampaignDeliverableTemplate[];
};

const deliverable = (
  key: string,
  kind: CampaignDeliverableKind,
  title: string,
  purpose: string,
): CampaignDeliverableTemplate => ({ key, kind, title, purpose });

export const GET_LISTED_PACKAGES = {
  // Legacy packages: never rename, reprice, or remove.
  starter: {
    key: "starter", label: "Starter", arenaName: "Challenger", target: 30, priceUsd: 60,
    durationDays: null, version: 1, legacy: true, deliverables: [],
  },
  growth: {
    key: "growth", label: "Growth", arenaName: "Contender", target: 60, priceUsd: 120,
    durationDays: null, version: 1, legacy: true, deliverables: [],
  },
  scale: {
    key: "scale", label: "Scale", arenaName: "Champion", target: 120, priceUsd: 180,
    durationDays: null, version: 1, legacy: true, deliverables: [],
  },

  launch_starter: {
    key: "launch_starter", label: "Launch Starter", arenaName: "Launch Starter", target: 15, priceUsd: 49,
    durationDays: 7, version: 2, legacy: false,
    deliverables: [
      deliverable("directory_distribution", "directory", "15 relevant directory submissions", "Save hours researching and completing repetitive launch forms."),
      deliverable("x_feature", "x_post", "Dedicated X product feature", "Introduce the product to The Arena's audience with a focused feature."),
      deliverable("promo_graphic", "graphic", "Ready-to-share promotional graphic", "Give the founder a reusable visual for their own channels."),
      deliverable("showcase_placement", "showcase", "7-day Get Listed showcase placement", "Keep the product visible beyond a single launch post."),
      deliverable("positioning_review", "strategy", "3 positioning suggestions", "Make the product's value easier for potential users to understand."),
      deliverable("final_report", "report", "Basic campaign report", "Record completed work, publication status, links, and available engagement metrics."),
    ],
  },
  growth_campaign: {
    key: "growth_campaign", label: "Growth Campaign", arenaName: "Growth Campaign", target: 30, priceUsd: 120,
    durationDays: 14, version: 2, legacy: false,
    deliverables: [
      deliverable("directory_distribution", "directory", "30 relevant directory submissions", "Save hours researching and submitting to appropriate launch platforms."),
      deliverable("youtube_demo", "youtube_video", "3–5 minute YouTube product demo", "Give potential users a real look at the product instead of another sales pitch."),
      deliverable("x_post_1", "x_post", "X promotional post: problem and solution", "Explain the problem the product solves."),
      deliverable("x_post_2", "x_post", "X promotional post: standout feature", "Present a second discovery angle without repeating the first post."),
      deliverable("linkedin_feature", "linkedin_post", "LinkedIn product feature", "Introduce the product to a professional audience."),
      deliverable("promo_graphic", "graphic", "Ready-to-share promotional graphic", "Give the founder a reusable campaign visual."),
      deliverable("showcase_placement", "showcase", "14-day Get Listed showcase placement", "Keep the product discoverable throughout the campaign."),
      deliverable("distribution_research", "strategy", "5 researched distribution opportunities", "Identify relevant places the founder can continue promoting after delivery."),
      deliverable("final_report", "report", "14-day campaign report", "Show deliverables, available reach, engagement, tracked clicks, and suggested next steps."),
    ],
  },
  launch_accelerator: {
    key: "launch_accelerator", label: "Launch Accelerator", arenaName: "Launch Accelerator", target: 45, priceUsd: 199,
    durationDays: 30, version: 2, legacy: false,
    deliverables: [
      deliverable("directory_distribution", "directory", "45 relevant directory submissions", "Build a wider directory footprint without repetitive founder work."),
      deliverable("youtube_walkthrough", "youtube_video", "5–7 minute YouTube product walkthrough", "Show how the product works in enough detail for serious potential users."),
      deliverable("youtube_short", "youtube_short", "YouTube Short", "Highlight one standout feature in a concise, reusable format."),
      deliverable("x_post_1", "x_post", "X promotional post: problem and solution", "Introduce the core problem the product solves."),
      deliverable("x_post_2", "x_post", "X promotional post: standout feature", "Show one useful product capability."),
      deliverable("x_post_3", "x_post", "X promotional post: use case", "Help a specific audience recognize when to use the product."),
      deliverable("x_post_4", "x_post", "X promotional post: campaign recap", "Give the campaign another discovery opportunity near completion."),
      deliverable("linkedin_post_1", "linkedin_post", "LinkedIn feature: founder problem", "Frame the product around a professional pain point."),
      deliverable("linkedin_post_2", "linkedin_post", "LinkedIn feature: practical use case", "Present a different angle for professional users."),
      deliverable("promo_graphic_1", "graphic", "Promotional graphic: product overview", "Provide a reusable visual summary of the product."),
      deliverable("promo_graphic_2", "graphic", "Promotional graphic: standout use case", "Provide a second visual for continued promotion."),
      deliverable("showcase_placement", "showcase", "30-day Get Listed showcase placement", "Keep the product visible throughout the full campaign."),
      deliverable("use_case_spotlight", "strategy", "Additional product use-case spotlight", "Show a real problem the product can help solve."),
      deliverable("distribution_research", "strategy", "10 researched distribution opportunities", "Give the founder relevant channels for continued distribution."),
      deliverable("mid_campaign_update", "update", "Mid-campaign progress update", "Show what is complete and what remains while the campaign is active."),
      deliverable("final_report", "report", "Final 30-day performance report", "Summarize completed work, available results, and practical next steps."),
    ],
  },
} as const satisfies Record<string, GetListedPackageDefinition>;

export type GetListedPackageKey = keyof typeof GET_LISTED_PACKAGES;
export type CurrentGetListedPackageKey = "launch_starter" | "growth_campaign" | "launch_accelerator";

export const CURRENT_GET_LISTED_PACKAGE_KEYS: readonly CurrentGetListedPackageKey[] = [
  "launch_starter", "growth_campaign", "launch_accelerator",
];

export function isGetListedPackageKey(value: unknown): value is GetListedPackageKey {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(GET_LISTED_PACKAGES, value);
}

export function isCurrentGetListedPackageKey(value: unknown): value is CurrentGetListedPackageKey {
  return typeof value === "string" && CURRENT_GET_LISTED_PACKAGE_KEYS.includes(value as CurrentGetListedPackageKey);
}
