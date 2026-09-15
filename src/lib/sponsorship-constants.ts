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
