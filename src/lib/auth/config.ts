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
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")
    || Array.from(raw).some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) return "/";
  try {
    const path = decodeURIComponent(raw.split(/[?#]/, 1)[0]);
    if (path.startsWith("//") || path.includes("\\")) return "/";
    const destination = new URL(raw, "https://arena.invalid");
    if (destination.origin !== "https://arena.invalid") return "/";
    return `${destination.pathname}${destination.search}${destination.hash}`;
  } catch {
    return "/";
  }
}

/** Keep the submission intent when switching from signup/verification to sign-in. */
export function signInDestination(pathname: string, search: string): string {
  if (pathname.startsWith("/auth/")) return sanitizeNextPath(new URLSearchParams(search).get("next"));
  return sanitizeNextPath(`${pathname || "/"}${pathname === "/submit" ? search : ""}`);
}
