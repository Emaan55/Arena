import "server-only";

/**
 * Structured server-side-only security logging — console output (picked up
 * by the hosting platform's log aggregation), never returned in any API
 * response. Intentionally logs only what's needed to investigate abuse
 * (event type, match id, truncated ip/fingerprint, timestamp) and never the
 * raw voter token or full fingerprint hash.
 */
export function logSecurityEvent(event: string, details: Record<string, string | number | boolean | null>) {
  console.warn(
    JSON.stringify({
      at: new Date().toISOString(),
      scope: "vote-security",
      event,
      ...details,
    }),
  );
}
