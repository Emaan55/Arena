const X_HANDLE_RE = /^[A-Za-z0-9_]{1,15}$/;

/**
 * Normalizes a founder X handle for storage: strips a leading '@', trims
 * whitespace, and validates against X's username rules. Returns null for
 * anything empty or invalid so callers can treat "no handle" and "bad
 * handle" the same way — we never guess or partially store one.
 */
export function normalizeXHandle(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim().replace(/^@/, "");
  if (!trimmed || !X_HANDLE_RE.test(trimmed)) return null;
  return trimmed;
}

export function xProfileUrl(handle: string): string {
  return `https://x.com/${handle}`;
}
