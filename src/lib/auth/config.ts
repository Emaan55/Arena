/**
 * Bump these when the actual terms/privacy text changes — each acceptance
 * row records which version was agreed to, so a future dispute doesn't
 * depend on guessing what the document said on a given date.
 */
export const TERMS_VERSION = "2026-09-22";
export const PRIVACY_VERSION = "2026-09-22";

export const PASSWORD_MIN_LENGTH = 8;

export interface PasswordCheck {
  minLength: boolean;
  hasUppercase: boolean;
  hasNumber: boolean;
}

export function checkPassword(password: string): PasswordCheck {
  return {
    minLength: password.length >= PASSWORD_MIN_LENGTH,
    hasUppercase: /[A-Z]/.test(password),
    hasNumber: /[0-9]/.test(password),
  };
}

export function isPasswordValid(password: string): boolean {
  const c = checkPassword(password);
  return c.minLength && c.hasUppercase && c.hasNumber;
}

/** Restricts a post-auth redirect target to a same-site relative path — never an open redirect. */
export function sanitizeNextPath(raw: string | null | undefined): string {
  if (!raw) return "/";
  return raw.startsWith("/") && !raw.startsWith("//") ? raw : "/";
}
