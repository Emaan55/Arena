import { TERMS_VERSION } from "@/lib/auth/config";

/**
 * Placeholder content — a real Terms of Service needs actual legal review
 * before launch. This page exists so the sign-up checkbox's link isn't
 * dead, and so TERMS_VERSION means something concrete if it's ever
 * bumped. Do not treat this copy as legally binding as written.
 */
export default function TermsPage() {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-16">
      <h1 className="font-display text-2xl font-bold text-ink">Terms of Service</h1>
      <p className="text-xs text-muted">Version {TERMS_VERSION} — placeholder text, pending legal review.</p>
      <div className="flex flex-col gap-4 text-sm text-muted">
        <p>
          By creating an account or using THE ARENA, you agree to use the platform honestly: no manipulating votes,
          submissions, or the Discount Drop game outside of the rules described on those features&apos; own pages.
        </p>
        <p>
          THE ARENA is provided as-is. Product submissions, duel outcomes, Get Listed campaign fulfillment, and
          Discount Drop discounts are all subject to the specific rules described where those features are offered.
        </p>
        <p>We may suspend accounts found to be abusing the platform (e.g. automated voting or gameplay).</p>
      </div>
    </main>
  );
}
