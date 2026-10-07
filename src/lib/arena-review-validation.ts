export const REVIEW_CATEGORIES = ["Visibility", "Community", "Product Discovery", "Experience"] as const;
export type ReviewCategory = (typeof REVIEW_CATEGORIES)[number];
export const ARENA_REVIEW_MAX = 500;
export const REVIEW_PHOTO_MAX_BYTES = 2 * 1024 * 1024;
export const REVIEW_SOCIAL_PLATFORMS = [
  { value: "x", label: "X (Twitter)" },
  { value: "instagram", label: "Instagram" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "other", label: "Other" },
] as const;
export type ReviewSocialPlatform = (typeof REVIEW_SOCIAL_PLATFORMS)[number]["value"];
export type ReviewerSocialProfile = {
  social_platform: ReviewSocialPlatform | null;
  social_handle: string | null;
  social_url: string | null;
};
const emptySocialProfile: ReviewerSocialProfile = { social_platform: null, social_handle: null, social_url: null };

export function normalizeReviewerSocial(platform: unknown, raw: unknown): { value: ReviewerSocialProfile; error?: never } | { error: string; value?: never } {
  const input = typeof raw === "string" ? raw.trim() : "";
  if (!input) return { value: emptySocialProfile };
  if (input.length > 500) return { error: "Your profile link is too long." };
  if (!REVIEW_SOCIAL_PLATFORMS.some((option) => option.value === platform)) return { error: "Choose a social platform for your profile." };
  let handle = input.replace(/^@/, "");
  const looksLikeUrl = input.includes("://") || /^(www\.)?(x\.com|twitter\.com|instagram\.com|linkedin\.com)\//i.test(input);
  let url: URL | null = null;
  if (looksLikeUrl || platform === "other") {
    try {
      url = new URL(input.includes("://") ? input : `https://${input}`);
      if (url.protocol !== "https:" || url.username || url.password || url.port) return { error: "Use a public HTTPS profile link." };
    } catch { return { error: "Enter a valid profile link." }; }
  }
  if (platform === "x") {
    if (url) {
      if (!["x.com", "www.x.com", "twitter.com", "www.twitter.com"].includes(url.hostname)) return { error: "Use an X handle or x.com profile link." };
      const match = url.pathname.match(/^\/([A-Za-z0-9_]{1,15})\/?$/);
      if (!match) return { error: "Enter your X profile, not a post link." };
      handle = match[1];
    }
    if (!/^[A-Za-z0-9_]{1,15}$/.test(handle) || ["home", "explore", "settings", "intent", "search", "i", "share"].includes(handle.toLowerCase())) return { error: "Enter a valid X handle (up to 15 letters, numbers, or underscores)." };
    return { value: { social_platform: "x", social_handle: handle, social_url: `https://x.com/${handle}` } };
  }
  if (platform === "instagram") {
    if (url) {
      if (!["instagram.com", "www.instagram.com"].includes(url.hostname)) return { error: "Use an Instagram handle or profile link." };
      const match = url.pathname.match(/^\/([A-Za-z0-9_.]{1,30})\/?$/);
      if (!match) return { error: "Enter your Instagram profile, not a post link." };
      handle = match[1];
    }
    if (!/^[A-Za-z0-9_][A-Za-z0-9_.]{0,29}$/.test(handle) || handle.endsWith(".") || handle.includes("..") || ["p", "reel", "reels", "stories", "accounts", "explore", "direct"].includes(handle.toLowerCase())) return { error: "Enter a valid Instagram handle." };
    return { value: { social_platform: "instagram", social_handle: handle, social_url: `https://www.instagram.com/${handle}/` } };
  }
  if (platform === "linkedin") {
    if (url) {
      if (!["linkedin.com", "www.linkedin.com"].includes(url.hostname)) return { error: "Use a LinkedIn personal profile link." };
      const match = url.pathname.match(/^\/in\/([^/]+)\/?$/);
      if (!match) return { error: "Use your linkedin.com/in/ profile link." };
      try { handle = decodeURIComponent(match[1]); } catch { return { error: "Enter a valid LinkedIn profile link." }; }
    }
    if (!/^[\p{L}\p{N}_-]{1,100}$/u.test(handle)) return { error: "Use your LinkedIn profile name or linkedin.com/in/ link." };
    return { value: { social_platform: "linkedin", social_handle: handle, social_url: `https://www.linkedin.com/in/${encodeURIComponent(handle)}/` } };
  }
  if (!url || !url.hostname.includes(".") || /^(localhost|.*\.localhost|.*\.local)$/.test(url.hostname) || /^[\d.]+$/.test(url.hostname) || url.hostname.includes(":")) return { error: "Use a public HTTPS profile link." };
  url.hash = "";
  if (url.href.length > 500) return { error: "Your profile link is too long." };
  return { value: { social_platform: "other", social_handle: null, social_url: url.href } };
}

/** Public-photo lookup only. This does not verify ownership of a handle. */
export function reviewerAvatarSources(profile: ReviewerSocialProfile & { profile_image_url?: string | null; avatar_url: string | null }): string[] {
  const sources = [safeAvatarUrl(profile.profile_image_url)];
  if (profile.social_handle && profile.social_platform && profile.social_platform !== "other") {
    const provider = profile.social_platform;
    const input = provider === "linkedin" ? `user:${profile.social_handle}` : profile.social_handle;
    sources.push(`https://unavatar.io/${provider}/${encodeURIComponent(input)}?fallback=false`);
  }
  sources.push(safeAvatarUrl(profile.avatar_url));
  return [...new Set(sources.filter((value): value is string => Boolean(value)))];
}

export function validateArenaReview(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { error: "Invalid review." } as const;
  const record = input as Record<string, unknown>;
  const body = typeof record.body === "string" ? record.body.trim() : "";
  const productName = typeof record.productName === "string" ? record.productName.trim() : "";
  const displayName = typeof record.displayName === "string" ? record.displayName.trim() : "";
  if (!displayName || Array.from(displayName).length > 100 || /[\u0000-\u001f\u007f]/.test(displayName)) return { error: "Enter your public name (up to 100 characters)." } as const;
  const social = normalizeReviewerSocial(record.socialPlatform, record.socialProfile);
  if (social.error) return { error: social.error } as const;
  const category = record.category;
  const rating = record.rating;
  if (!Number.isInteger(rating) || typeof rating !== "number" || rating < 1 || rating > 5) {
    return { error: "Choose a rating from 1 to 5 stars." } as const;
  }
  if (Array.from(body).length < 10 || Array.from(body).length > ARENA_REVIEW_MAX) {
    return { error: `Write between 10 and ${ARENA_REVIEW_MAX} characters.` } as const;
  }
  if (productName.length > 80) return { error: "Product name must be 80 characters or fewer." } as const;
  if (!REVIEW_CATEGORIES.includes(category as ReviewCategory)) return { error: "Choose a review category." } as const;
  return { value: { body, rating, author_name: displayName, ...social.value, product_name: productName || null, category: category as ReviewCategory } } as const;
}

export function safeAvatarUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}
