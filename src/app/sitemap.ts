import type { MetadataRoute } from "next";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

// Root metadata identifies www as the production canonical host, while the
// bare apex redirects there. Keep sitemap URLs stable even during preview or
// local builds where NEXT_PUBLIC_SITE_URL may be unset or host-specific.
const CANONICAL_ORIGIN = "https://www.thearena.lol";

const PUBLIC_PRODUCT_STATUSES = ["active", "unique", "eliminated", "champion"] as const;

export const revalidate = 3600;

function absoluteUrl(path: string) {
  return new URL(path, `${CANONICAL_ORIGIN}/`).toString();
}

function reliableDate(value: string | null | undefined): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

const STATIC_ROUTES: MetadataRoute.Sitemap = [
  { url: absoluteUrl("/"), changeFrequency: "daily", priority: 1 },
  { url: absoluteUrl("/live-battles"), changeFrequency: "hourly", priority: 0.9 },
  { url: absoluteUrl("/get-listed"), changeFrequency: "weekly", priority: 0.8 },
  { url: absoluteUrl("/reviews"), changeFrequency: "weekly", priority: 0.7 },
  { url: absoluteUrl("/privacy"), changeFrequency: "yearly", priority: 0.2 },
  { url: absoluteUrl("/terms"), changeFrequency: "yearly", priority: 0.2 },
];

/**
 * Public discovery only. Account, admin, checkout, campaign tracking, auth,
 * and unsubscribe routes are deliberately absent. Database failures degrade
 * to the static public routes so /sitemap.xml still returns valid XML.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  try {
    const admin = createAdminSupabaseClient();
    const [productsResult, duelsResult, announcementsResult] = await Promise.all([
      admin
        .from("products")
        .select("id, submitted_at")
        .in("status", [...PUBLIC_PRODUCT_STATUSES])
        .order("submitted_at", { ascending: false }),
      admin
        .from("matches")
        .select("id")
        .eq("status", "active")
        .order("created_at", { ascending: false }),
      admin
        .from("arena_announcements")
        .select("id, published_at")
        .eq("status", "published")
        .order("published_at", { ascending: false }),
    ]);

    const productRoutes: MetadataRoute.Sitemap = (productsResult.data ?? []).map((product) => ({
      url: absoluteUrl(`/product/${product.id}`),
      lastModified: reliableDate(product.submitted_at),
      changeFrequency: "weekly",
      priority: 0.7,
    }));

    const duelRoutes: MetadataRoute.Sitemap = (duelsResult.data ?? []).map((duel) => ({
      url: absoluteUrl(`/duel/${duel.id}`),
      changeFrequency: "hourly",
      priority: 0.8,
    }));

    const announcementRoutes: MetadataRoute.Sitemap = (announcementsResult.data ?? []).map(
      (announcement) => ({
        url: absoluteUrl(`/announcements/${announcement.id}`),
        lastModified: reliableDate(announcement.published_at),
        changeFrequency: "monthly",
        priority: 0.5,
      }),
    );

    return [...STATIC_ROUTES, ...productRoutes, ...duelRoutes, ...announcementRoutes];
  } catch {
    return STATIC_ROUTES;
  }
}

