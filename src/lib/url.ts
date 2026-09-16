// Shared by product submission (POST /api/products) and external
// sponsorship (POST /api/sponsorship/checkout) so both validate/normalize
// URLs the same way.
export function normalizeUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const u = new URL(withScheme);
    if (!u.hostname.includes(".")) return null;
    u.protocol = "https:"; // normalize scheme so http/https variants dedupe as the same URL
    return u.toString();
  } catch {
    return null;
  }
}
