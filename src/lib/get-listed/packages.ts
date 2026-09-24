/**
 * The single source of truth for Get Listed package pricing/targets. This
 * is public marketing data (safe to import from Client Components to
 * render the package cards) — the security property isn't secrecy of the
 * numbers, it's that every price/target actually *used* (campaign
 * creation, admin display, a future checkout) is re-resolved from here
 * server-side by packageKey, never trusted from a client-submitted price
 * or target value.
 */
// `arenaName` is presentation-only (the customer-facing Get Listed page and
// campaign modal), never sent to or read from the backend, which still
// only ever knows a campaign by its `key`. `label` stays the plain
// internal name shown in admin tooling.
export const GET_LISTED_PACKAGES = {
  starter: { key: "starter", label: "Starter", arenaName: "Challenger", target: 30, priceUsd: 60 },
  growth: { key: "growth", label: "Growth", arenaName: "Contender", target: 60, priceUsd: 120 },
  scale: { key: "scale", label: "Scale", arenaName: "Champion", target: 120, priceUsd: 180 },
} as const;

export type GetListedPackageKey = keyof typeof GET_LISTED_PACKAGES;

export function isGetListedPackageKey(value: unknown): value is GetListedPackageKey {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(GET_LISTED_PACKAGES, value);
}
