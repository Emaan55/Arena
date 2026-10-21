export const FOUNDER_REPLY_MIN = 10;
export const FOUNDER_REPLY_MAX = 2000;
export const REVIEW_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validateFounderReply(value: unknown): { body: string; error?: never } | { error: string; body?: never } {
  const body = typeof value === "string" ? value.trim() : "";
  const length = Array.from(body).length;
  if (length < FOUNDER_REPLY_MIN || length > FOUNDER_REPLY_MAX || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(body)) {
    return { error: `Reply must be between ${FOUNDER_REPLY_MIN} and ${FOUNDER_REPLY_MAX} characters.` };
  }
  return { body };
}
