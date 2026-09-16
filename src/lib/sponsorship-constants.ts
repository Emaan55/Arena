// Split out from lib/sponsorship.ts (which is `server-only`) so client
// components can import pricing/duration constants directly — same
// reasoning as edit-token-storage.ts vs. edit-token.ts.

export const SPONSOR_DURATIONS = [7, 14, 30] as const;
export type SponsorDuration = (typeof SPONSOR_DURATIONS)[number];

export const SPONSOR_PRICE_CENTS: Record<SponsorDuration, number> = {
  7: 500,
  14: 1000,
  30: 1500,
};

export const SPONSOR_PRICE_LABELS: Record<SponsorDuration, string> = {
  7: "$5",
  14: "$10",
  30: "$15",
};

export function isSponsorDuration(value: number): value is SponsorDuration {
  return (SPONSOR_DURATIONS as readonly number[]).includes(value);
}

/** Whatever the Sponsored section / admin panel needs to render a listing,
 * regardless of whether it's backed by an Arena product or an external URL. */
export interface SponsorDisplay {
  name: string;
  url: string;
  category: string;
  description: string;
  logoUrl: string | null;
  xHandle: string | null;
}

export interface SponsorshipDisplaySource {
  is_external: boolean;
  external_name: string | null;
  external_url: string | null;
  external_category: string | null;
  external_description: string | null;
  logo_url: string | null;
  founder_x_handle: string | null;
  product: { name: string; url: string; category: string; pitch: string } | null;
}

/** Pure data-shaping (no fetches), so both server routes and client
 * components can call it on the same sponsorship row without duplicating
 * the is_external branch everywhere it's displayed. */
export function resolveSponsorshipDisplay(s: SponsorshipDisplaySource): SponsorDisplay | null {
  if (s.is_external) {
    if (!s.external_name || !s.external_url) return null;
    return {
      name: s.external_name,
      url: s.external_url,
      category: s.external_category ?? "Other",
      description: s.external_description ?? "",
      logoUrl: s.logo_url,
      xHandle: s.founder_x_handle,
    };
  }
  if (s.product) {
    return {
      name: s.product.name,
      url: s.product.url,
      category: s.product.category,
      description: s.product.pitch,
      logoUrl: s.logo_url,
      xHandle: s.founder_x_handle,
    };
  }
  return null;
}
