import type { MetadataRoute } from "next";

const CANONICAL_ORIGIN = "https://www.thearena.lol";

/**
 * Public Arena pages are crawlable by default. These prefixes cover only
 * authenticated, administrative, machine-only, or token-bearing routes.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/admin/",
        "/dashboard/",
        "/auth/",
        "/api/",
        "/get-listed/campaigns",
        "/reset-password",
        "/unsubscribe",
      ],
    },
    sitemap: `${CANONICAL_ORIGIN}/sitemap.xml`,
    host: CANONICAL_ORIGIN,
  };
}

