import { PRIVACY_VERSION } from "@/lib/auth/config";

/**
 * Placeholder content — a real Privacy Policy needs actual legal review
 * before launch. Exists so the sign-up checkbox's link isn't dead.
 */
export default function PrivacyPage() {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-16">
      <h1 className="font-display text-2xl font-bold text-ink">Privacy Policy</h1>
      <p className="text-xs text-muted">Version {PRIVACY_VERSION} — placeholder text, pending legal review.</p>
      <div className="flex flex-col gap-4 text-sm text-muted">
        <p>
          THE ARENA stores your email address and authentication details via Supabase Auth to identify your account.
          If you sign up with a password, only Supabase ever handles that password — we never see or store it
          ourselves.
        </p>
        <p>
          Voting, product submissions, Get Listed campaigns, and Discount Drop results are linked to your account so
          the platform can enforce its one-vote-per-duel and attempt-limit rules.
        </p>
        <p>We do not sell your data to third parties.</p>
      </div>
    </main>
  );
}
