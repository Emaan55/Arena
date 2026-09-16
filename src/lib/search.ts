// Shared by GET /api/search and GET /api/products (the sponsorship
// picker's "browse Arena products" list) — anywhere a free-text query
// feeds into a PostgREST `ilike`/`.or()` filter.

// PostgREST's `.or()` filter syntax uses "," to separate conditions and
// "()" to group them, and `ilike` treats "%"/"_" as wildcards — strip/escape
// all of them so a search term is always treated as a literal substring,
// never as filter syntax or a wildcard pattern the caller controls.
export function toSearchPattern(raw: string): string {
  const stripped = raw.replace(/^@/, "").replace(/[,()]/g, " ").trim();
  const escaped = stripped.replace(/[\\%_]/g, (m) => `\\${m}`);
  return `%${escaped}%`;
}
