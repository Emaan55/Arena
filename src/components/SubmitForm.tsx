"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, DollarSign, Gift } from "lucide-react";
import { CATEGORIES, type Category, type Product } from "@/types/database";
import type { ArenaState } from "@/lib/arena-state";
import { editTokenStorageKey } from "@/lib/edit-token-storage";
import { useAuthUser } from "@/lib/useAuthUser";
import { PayButton } from "./PayButton";

const BATTLE_PITCH_MAX = 120;
const WHY_US_MAX = 160;
const DIFFERENTIATOR_MAX = 60;
const VOTES_REQUIRED = 5;
const REVIEWS_REQUIRED = 2;

interface FreeProgress {
  availableFreeSubmissions: number;
  votesTowardNext: number;
  reviewsTowardNext: number;
  ready: boolean;
}

export function SubmitForm({
  onSubmitted,
}: {
  onSubmitted: (product: Product, state: ArenaState) => void;
}) {
  const router = useRouter();
  const { user, loading: authLoading } = useAuthUser();

  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [category, setCategory] = useState<Category>("General");
  const [pitch, setPitch] = useState("");
  const [battlePitch, setBattlePitch] = useState("");
  const [whyUs, setWhyUs] = useState("");
  const [differentiators, setDifferentiators] = useState(["", "", ""]);
  const [xHandle, setXHandle] = useState("");
  const [showBattleFields, setShowBattleFields] = useState(false);
  const [website, setWebsite] = useState(""); // honeypot — real users never see or fill this
  const [renderedAt] = useState(() => Date.now());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [paidPending, setPaidPending] = useState(false);

  const [freeProgress, setFreeProgress] = useState<FreeProgress | null>(null);
  const [progressLoading, setProgressLoading] = useState(false);

  function refreshProgress() {
    setProgressLoading(true);
    fetch("/api/free-submission/status")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setFreeProgress(data))
      .catch(() => {})
      .finally(() => setProgressLoading(false));
  }

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clearing stale progress on sign-out, not a render-driven derivation
      setFreeProgress(null);
      return;
    }
    refreshProgress();
  }, [user, authLoading]);

  function currentFields() {
    return {
      name,
      url,
      category,
      pitch,
      battlePitch,
      whyUs,
      differentiators: differentiators.map((d) => d.trim()).filter(Boolean),
      xHandle,
      website,
      renderedAt,
    };
  }

  function resetFields() {
    setName("");
    setUrl("");
    setPitch("");
    setBattlePitch("");
    setWhyUs("");
    setDifferentiators(["", "", ""]);
    setXHandle("");
  }

  function goSignIn() {
    router.push(`/auth/sign-in?next=${encodeURIComponent("/#submit")}`);
  }

  async function submitFree() {
    if (!user) {
      goSignIn();
      return;
    }
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    setPaidPending(false);
    try {
      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(currentFields()),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        return;
      }
      const product = data.product as Product;
      if (data.editToken && typeof window !== "undefined") {
        try {
          window.localStorage.setItem(editTokenStorageKey(product.id), data.editToken as string);
        } catch {
          // localStorage unavailable — the submitter just won't be able to
          // edit later from this browser; submission itself still succeeded.
        }
      }
      onSubmitted(product, data.state as ArenaState);
      resetFields();
      setSuccess("You're in the arena. Watch for your first duel below.");
      refreshProgress();
    } catch {
      setError("Network error, please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function handlePaidSuccess() {
    setError(null);
    setSuccess(null);
    setPaidPending(true);
    resetFields();
  }

  const formValid = name.trim().length > 0 && url.trim().length > 0 && pitch.trim().length > 0;

  return (
    <div
      id="submit"
      className="mx-auto flex w-full max-w-xl flex-col gap-3 rounded-2xl border border-border bg-surface p-6 text-left shadow-lg"
    >
      {/* Honeypot: hidden from real users, invisible to screen readers, but
          present in the DOM for bots that blindly fill every field. */}
      <input
        type="text"
        name="website"
        value={website}
        onChange={(e) => setWebsite(e.target.value)}
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="absolute left-[-9999px] h-0 w-0 opacity-0"
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Product name"
          maxLength={80}
          required
          className="rounded-lg border border-border bg-bg px-3 py-2 text-ink placeholder:text-muted transition-colors duration-150 ease-out focus:border-accent focus:outline-none"
        />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as Category)}
          className="rounded-lg border border-border bg-bg px-3 py-2 text-ink transition-colors duration-150 ease-out focus:border-accent focus:outline-none"
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>
      <input
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://yourproduct.com"
        required
        className="rounded-lg border border-border bg-bg px-3 py-2 text-ink placeholder:text-muted transition-colors duration-150 ease-out focus:border-accent focus:outline-none"
      />
      <input
        value={pitch}
        onChange={(e) => setPitch(e.target.value)}
        placeholder="One-line pitch (what does it do?)"
        maxLength={140}
        required
        className="rounded-lg border border-border bg-bg px-3 py-2 text-ink placeholder:text-muted transition-colors duration-150 ease-out focus:border-accent focus:outline-none"
      />
      <input
        value={xHandle}
        onChange={(e) => setXHandle(e.target.value)}
        placeholder="X handle (optional): @yourhandle"
        className="rounded-lg border border-border bg-bg px-3 py-2 text-ink placeholder:text-muted transition-colors duration-150 ease-out focus:border-accent focus:outline-none"
      />
      <p className="-mt-1 text-xs text-muted">Connect your product to its founder.</p>

      <button
        type="button"
        onClick={() => setShowBattleFields((v) => !v)}
        className="self-start text-xs font-semibold text-accent transition-colors duration-150 ease-out hover:text-ink"
      >
        {showBattleFields ? "Hide Battle Pitch (optional)" : "+ Add a Battle Pitch (optional)"}
      </button>

      {showBattleFields && (
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-bg p-4">
          <div className="flex flex-col gap-0.5">
            <span className="text-xs font-bold uppercase tracking-wide text-accent">Battle Pitch</span>
            <span className="text-xs text-muted">Make your case. Give voters a reason to choose you.</span>
          </div>
          <input
            value={battlePitch}
            onChange={(e) => setBattlePitch(e.target.value)}
            maxLength={BATTLE_PITCH_MAX}
            placeholder="What makes this the product to beat?"
            className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted transition-colors duration-150 ease-out focus:border-accent focus:outline-none"
          />
          <input
            value={whyUs}
            onChange={(e) => setWhyUs(e.target.value)}
            maxLength={WHY_US_MAX}
            placeholder="Why Us? Why should voters pick you?"
            className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted transition-colors duration-150 ease-out focus:border-accent focus:outline-none"
          />
          <div className="flex flex-col gap-2">
            {differentiators.map((d, i) => (
              <input
                key={i}
                value={d}
                onChange={(e) => {
                  const next = [...differentiators];
                  next[i] = e.target.value;
                  setDifferentiators(next);
                }}
                maxLength={DIFFERENTIATOR_MAX}
                placeholder={`Key differentiator ${i + 1} (optional)`}
                className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted transition-colors duration-150 ease-out focus:border-accent focus:outline-none"
              />
            ))}
          </div>
        </div>
      )}

      {error && <p className="text-sm text-danger">{error}</p>}
      {success && <p className="text-sm text-ink">{success}</p>}
      {paidPending && (
        <p className="text-sm text-ink">
          Payment received. Your product will appear in the arena within moments.
        </p>
      )}

      <div className="mt-1 flex flex-col gap-3 border-t border-border pt-4">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted">Choose how to submit</span>
        <div className="grid gap-3 sm:grid-cols-2">
          {/* Pay $1 */}
          <div className="flex flex-col gap-2 rounded-xl border border-border bg-bg p-4">
            <span className="flex items-center gap-1.5 text-sm font-bold text-ink">
              <DollarSign className="h-4 w-4 text-accent" />
              Submit for $1
            </span>
            <p className="flex-1 text-xs text-muted">Pay once, submit immediately.</p>
            <PayButton
              type="submit"
              endpoint="/api/submit/checkout"
              extraBody={currentFields()}
              onPaid={handlePaidSuccess}
              label={formValid ? "Pay $1 & Submit" : "Fill out the form above"}
              className={`w-full rounded-lg px-3 py-2 text-sm font-semibold shadow-sm transition-all duration-150 ease-out active:scale-95 disabled:pointer-events-none disabled:opacity-50 ${
                formValid
                  ? "bg-accent text-accent-ink hover:-translate-y-0.5 hover:shadow-md"
                  : "bg-surface-2 text-muted"
              }`}
            />
          </div>

          {/* Earn a free submission */}
          <div className="flex flex-col gap-2 rounded-xl border border-border bg-bg p-4">
            <span className="flex items-center gap-1.5 text-sm font-bold text-ink">
              <Gift className="h-4 w-4 text-accent" />
              Earn a Free Submission
            </span>

            {!user && !authLoading ? (
              <>
                <p className="flex-1 text-xs text-muted">
                  Vote on {VOTES_REQUIRED} products and leave {REVIEWS_REQUIRED} reviews to unlock one free
                  submission.
                </p>
                <button
                  type="button"
                  onClick={goSignIn}
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm font-semibold text-ink transition-all duration-150 ease-out hover:-translate-y-0.5 hover:shadow-md active:scale-95"
                >
                  Sign in to start earning
                </button>
              </>
            ) : progressLoading || !freeProgress || authLoading ? (
              <p className="flex-1 text-xs text-muted">Checking your progress…</p>
            ) : freeProgress.availableFreeSubmissions > 0 ? (
              <>
                <p className="flex-1 text-xs font-semibold text-accent">Free submission unlocked</p>
                <button
                  type="button"
                  onClick={submitFree}
                  disabled={submitting || !formValid}
                  className="w-full rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-accent-ink shadow-sm transition-all duration-150 ease-out active:scale-95 disabled:pointer-events-none disabled:opacity-50"
                >
                  {submitting ? "Submitting…" : formValid ? "Submit for free" : "Fill out the form above"}
                </button>
              </>
            ) : (
              <div className="flex flex-1 flex-col gap-1 text-xs">
                <span
                  className={`flex items-center gap-1.5 ${
                    freeProgress.votesTowardNext >= VOTES_REQUIRED ? "text-accent" : "text-muted"
                  }`}
                >
                  {freeProgress.votesTowardNext >= VOTES_REQUIRED ? (
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                  ) : (
                    <span className="h-3.5 w-3.5 shrink-0 rounded-full border border-border" />
                  )}
                  Vote on {VOTES_REQUIRED} products ({freeProgress.votesTowardNext}/{VOTES_REQUIRED})
                </span>
                <span
                  className={`flex items-center gap-1.5 ${
                    freeProgress.reviewsTowardNext >= REVIEWS_REQUIRED ? "text-accent" : "text-muted"
                  }`}
                >
                  {freeProgress.reviewsTowardNext >= REVIEWS_REQUIRED ? (
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                  ) : (
                    <span className="h-3.5 w-3.5 shrink-0 rounded-full border border-border" />
                  )}
                  {freeProgress.reviewsTowardNext}/{REVIEWS_REQUIRED} reviews submitted
                </span>
                {(() => {
                  const votesLeft = VOTES_REQUIRED - freeProgress.votesTowardNext;
                  const reviewsLeft = REVIEWS_REQUIRED - freeProgress.reviewsTowardNext;
                  const parts: string[] = [];
                  if (votesLeft > 0) parts.push(`${votesLeft} more vote${votesLeft === 1 ? "" : "s"}`);
                  if (reviewsLeft > 0) parts.push(`${reviewsLeft} more review${reviewsLeft === 1 ? "" : "s"}`);
                  if (parts.length === 0) return null;
                  return <span className="text-muted">{parts.join(" and ")} to unlock</span>;
                })()}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
