"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Gift, Globe2, Loader2, LockKeyhole, Sparkles, Zap } from "lucide-react";
import { CATEGORIES, type Category, type Product } from "@/types/database";
import type { ArenaState } from "@/lib/arena-state";
import { editTokenStorageKey } from "@/lib/edit-token-storage";
import { useAuthUser } from "@/lib/useAuthUser";
import { submissionPath } from "@/lib/submission-path";
import { decodeSubmissionDraft, draftKey, emptySubmissionDraft, encodeSubmissionDraft, productDetailsError, type SubmissionDraft } from "@/lib/submission-draft";
import type { AutofillResult } from "@/lib/product-autofill-schema";
import { PayButton } from "./PayButton";

interface FreeProgress { availableFreeSubmissions: number; votesTowardNext: number; reviewsTowardNext: number; ready: boolean }
const inputClass = "min-h-11 w-full min-w-0 rounded-xl border border-border bg-bg px-3.5 py-3 text-base text-ink placeholder:text-muted transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/15 disabled:opacity-60 sm:text-sm";
const secondaryButton = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border bg-bg px-4 py-2.5 text-sm font-semibold text-ink transition-colors hover:border-accent focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50";

export function SubmitForm({ onSubmitted, initialCategory = "General" }: {
  onSubmitted: (product: Product, state: ArenaState) => void; initialCategory?: Category;
}) {
  const router = useRouter();
  const { user, loading: authLoading } = useAuthUser();
  const [fields, setFields] = useState<SubmissionDraft>(() => emptySubmissionDraft(initialCategory));
  const [step, setStep] = useState<1 | 2>(1);
  const [expanded, setExpanded] = useState(false);
  const [showBattleFields, setShowBattleFields] = useState(false);
  const [draftOwner, setDraftOwner] = useState<string | null>(null);
  const [draftMessage, setDraftMessage] = useState("Your draft stays private until you submit.");
  const [website, setWebsite] = useState("");
  const [renderedAt] = useState(() => Date.now());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paidPending, setPaidPending] = useState(false);
  const [autofilling, setAutofilling] = useState(false);
  const [autofillNotice, setAutofillNotice] = useState<string | null>(null);
  const autofillRequest = useRef<AbortController | null>(null);
  const [freeProgress, setFreeProgress] = useState<FreeProgress | null>(null);
  const [progressLoading, setProgressLoading] = useState(false);
  const userId = user?.id;

  useEffect(() => {
    if (!userId) return;
    let saved = null;
    try { saved = decodeSubmissionDraft(sessionStorage.getItem(draftKey(userId))); } catch {}
    // eslint-disable-next-line react-hooks/set-state-in-effect -- restore one account-scoped browser draft after authentication
    setFields(saved?.fields ?? emptySubmissionDraft(initialCategory));
    setStep(saved?.step ?? 1); setExpanded(saved?.expanded ?? false);
    setShowBattleFields(Boolean(saved?.fields.battlePitch || saved?.fields.whyUs || saved?.fields.differentiators.some(Boolean)));
    setDraftOwner(userId);
    setAutofilling(false);
    if (saved) setDraftMessage("Private draft restored in this tab. It expires after 24 hours.");
  }, [userId, initialCategory]);
  useEffect(() => () => { autofillRequest.current?.abort(); autofillRequest.current = null; }, [userId]);

  function persist(nextFields = fields, nextStep = step, nextExpanded = expanded) {
    if (!userId || draftOwner !== userId) return;
    try {
      sessionStorage.setItem(draftKey(userId), encodeSubmissionDraft({ fields: nextFields, step: nextStep, expanded: nextExpanded }));
      setDraftMessage("Draft saved privately in this tab for 24 hours.");
    } catch { setDraftMessage("Draft saving is unavailable in this browser. Keep this tab open while you submit."); }
  }
  function updateFields(changes: Partial<SubmissionDraft>) {
    const next = { ...fields, ...changes }; setFields(next); persist(next);
  }
  function moveStep(next: 1 | 2) {
    const problem = next === 2 ? productDetailsError(fields) : null;
    setError(problem); if (problem) return;
    setStep(next); persist(fields, next);
  }
  function manualEntry() {
    autofillRequest.current?.abort(); autofillRequest.current = null; setAutofilling(false);
    setExpanded(true); persist(fields, 1, true);
  }
  function clearDraft() {
    if (userId) { try { sessionStorage.removeItem(draftKey(userId)); } catch {} }
    setFields(emptySubmissionDraft(initialCategory)); setStep(1); setExpanded(false);
    setDraftMessage("Your draft stays private until you submit.");
  }
  function refreshProgress() {
    setProgressLoading(true);
    fetch("/api/free-submission/status").then((res) => res.ok ? res.json() : null)
      .then((data) => setFreeProgress(data)).catch(() => setFreeProgress(null)).finally(() => setProgressLoading(false));
  }
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clear stale eligibility after sign-out
      setFreeProgress(null); return;
    }
    refreshProgress();
    window.addEventListener("focus", refreshProgress);
    return () => window.removeEventListener("focus", refreshProgress);
  }, [user, authLoading]);

  async function autofill() {
    if (!fields.url.trim()) { setError("Paste your product website first."); return; }
    const controller = new AbortController(); autofillRequest.current?.abort(); autofillRequest.current = controller;
    setAutofilling(true); setError(null); setAutofillNotice(null);
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch("/api/submit/autofill", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: fields.url }), signal: controller.signal });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Auto-fill is unavailable. Enter your details manually.");
      if (autofillRequest.current !== controller) return;
      const data = result as AutofillResult;
      const next = { ...fields, ...data.fields };
      setFields(next); setExpanded(true); setShowBattleFields(Boolean(next.battlePitch || next.whyUs || next.differentiators.some(Boolean)));
      setAutofillNotice(data.notice); persist(next, 1, true);
    } catch (cause) {
      if (autofillRequest.current !== controller) return;
      setError(controller.signal.aborted ? "Auto-fill took too long. Please enter your details manually." : cause instanceof Error ? cause.message : "Auto-fill failed. Please enter your details manually.");
      setExpanded(true); persist(fields, 1, true);
    } finally {
      clearTimeout(timer);
      if (autofillRequest.current === controller) { autofillRequest.current = null; setAutofilling(false); }
    }
  }
  function currentFields() { return { ...fields, differentiators: fields.differentiators.map((d) => d.trim()).filter(Boolean), website, renderedAt }; }
  function goSignIn() { persist(); router.push(`/auth/sign-in?next=${encodeURIComponent(submissionPath(fields.category))}`); }
  async function submitFree() {
    if (!user) { goSignIn(); return; }
    const problem = productDetailsError(fields); if (problem) { setError(problem); setStep(1); return; }
    setSubmitting(true); setError(null); setPaidPending(false);
    try {
      const statusRes = await fetch("/api/free-submission/status");
      const statusData = statusRes.ok ? await statusRes.json() : null;
      if (!statusData || statusData.availableFreeSubmissions < 1) {
        setFreeProgress(statusData); setError("You haven't earned a free submission yet. Vote on 5 duels and leave 2 reviews, or pay $1 to submit now."); return;
      }
      const res = await fetch("/api/products", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(currentFields()) });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Something went wrong."); return; }
      const product = data.product as Product;
      if (data.editToken) { try { localStorage.setItem(editTokenStorageKey(product.id), data.editToken); } catch {} }
      clearDraft(); onSubmitted(product, data.state as ArenaState); refreshProgress();
    } catch { setError("Network error, please try again."); }
    finally { setSubmitting(false); }
  }
  function handlePaidSuccess() { setError(null); setPaidPending(true); clearDraft(); }

  if (!authLoading && !user) return <section className="mx-auto w-full max-w-3xl rounded-2xl border border-border bg-bg p-6 shadow-sm">
    <p role="status" className="mb-4 text-sm text-muted">Sign in again to continue. Your private draft is kept in this tab.</p>
    <button type="button" onClick={goSignIn} className={secondaryButton}>Sign in to continue</button>
  </section>;
  if (authLoading || draftOwner !== userId) return <div role="status" className="mx-auto flex min-h-40 w-full max-w-3xl items-center justify-center gap-3 rounded-2xl border border-border bg-surface p-6 text-sm text-muted"><Loader2 className="h-4 w-4 animate-spin" />Preparing your private draft…</div>;

  const eligible = (freeProgress?.availableFreeSubmissions ?? 0) > 0;
  return <section id="submit" aria-label="Product submission" className="mx-auto flex w-full min-w-0 max-w-3xl flex-col gap-5">
    <nav aria-label="Submission progress" className="grid grid-cols-2 gap-3 rounded-2xl border border-border bg-surface p-2 sm:p-3">
      {[{ number: 1, title: "Product Details" }, { number: 2, title: "Choose Your Entry" }].map(({ number, title }) => <button key={number} type="button" onClick={() => moveStep(number as 1 | 2)} disabled={autofilling || submitting || (number === 2 && !expanded)} aria-current={step === number ? "step" : undefined}
        className={`flex min-h-12 min-w-0 items-center gap-2 rounded-xl px-2 py-2 text-left text-xs font-semibold transition-colors sm:gap-3 sm:px-4 sm:text-sm ${step === number ? "bg-bg text-ink shadow-sm ring-1 ring-border" : "text-muted"} disabled:opacity-60`}>
        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs ${step === number || step > number ? "bg-accent text-accent-ink" : "border border-border"}`}>{step > number ? <Check className="h-3.5 w-3.5" /> : number}</span><span>{title}</span>
      </button>)}
    </nav>

    {paidPending && <p role="status" className="rounded-xl border border-accent/30 bg-accent/5 p-4 text-sm text-ink">Payment received. Your product will appear in the arena once payment confirmation is processed.</p>}
    {step === 1 ? <>
      <div className="rounded-2xl border border-accent/30 bg-bg p-4 shadow-sm sm:p-6">
        <div className="mb-5 flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent"><Sparkles className="h-5 w-5" /></span><div><h2 className="font-display text-lg font-bold text-ink">Add your startup in seconds ✨</h2><p className="mt-1 text-sm leading-relaxed text-muted">Start with your website. You&apos;ll review everything before it goes live.</p></div></div>
        <form noValidate onSubmit={(event) => { event.preventDefault(); void autofill(); }} className="flex min-w-0 flex-col gap-3 sm:flex-row">
          <div className="relative min-w-0 flex-1"><label htmlFor="autofill-url" className="sr-only">Product website for auto-fill</label><Globe2 aria-hidden="true" className="pointer-events-none absolute left-3.5 top-3.5 h-4 w-4 text-muted" /><input id="autofill-url" value={fields.url} onChange={(event) => updateFields({ url: event.target.value })} disabled={autofilling} inputMode="url" autoComplete="url" maxLength={2048} placeholder="https://yourproduct.com" className={`${inputClass} pl-10`} /></div>
          <button type="submit" disabled={autofilling || !fields.url.trim()} className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-xl bg-accent px-5 py-3 text-sm font-bold text-accent-ink transition-colors hover:brightness-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50">{autofilling ? <><Loader2 className="h-4 w-4 animate-spin" />Reading your website…</> : "Auto-fill with AI ✨"}</button>
        </form>
        <p className="mt-3 text-xs leading-relaxed text-muted">We use publicly available website details. Use your homepage URL without private query parameters.</p>
        <button type="button" onClick={manualEntry} className="mt-2 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-accent underline-offset-4 hover:underline">{expanded ? "Edit details manually" : "Enter details manually"}<ArrowRight className="h-4 w-4" /></button>
      </div>

      {autofillNotice && <p role="status" className="flex items-start gap-2 rounded-xl border border-accent/25 bg-accent/5 p-4 text-sm leading-relaxed text-ink"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-accent" />{autofillNotice}</p>}
      {expanded && <form noValidate onSubmit={(event) => { event.preventDefault(); moveStep(2); }} className="rounded-2xl border border-border bg-bg p-4 shadow-sm sm:p-6">
        <div className="mb-6"><p className="text-xs font-bold uppercase tracking-wider text-accent">Step 1</p><h2 className="mt-1 font-display text-xl font-bold text-ink">Make a great first impression.</h2><p className="mt-1 text-sm text-muted">Confirm your details. Everything here is editable.</p></div>
        <input name="website" value={website} onChange={(event) => setWebsite(event.target.value)} tabIndex={-1} autoComplete="off" aria-hidden="true" className="absolute left-[-9999px] h-0 w-0 opacity-0" />
        <fieldset disabled={autofilling} className="grid min-w-0 gap-5">
          <div className="grid min-w-0 gap-5 sm:grid-cols-2">
            <label className="min-w-0 text-sm font-semibold text-ink" htmlFor="product-name">Product name <span className="text-accent">*</span><input id="product-name" required value={fields.name} onChange={(e) => updateFields({ name: e.target.value })} placeholder="Product name" maxLength={80} className={`${inputClass} mt-2 font-normal`} /></label>
            <label className="min-w-0 text-sm font-semibold text-ink" htmlFor="product-category">Category <span className="text-accent">*</span><select id="product-category" value={fields.category} onChange={(e) => updateFields({ category: e.target.value as Category })} className={`${inputClass} mt-2 font-normal`}>{CATEGORIES.map((category) => <option key={category}>{category}</option>)}</select></label>
          </div>
          <label className="min-w-0 text-sm font-semibold text-ink" htmlFor="product-url">Website URL <span className="text-accent">*</span><input id="product-url" required value={fields.url} onChange={(e) => updateFields({ url: e.target.value })} inputMode="url" placeholder="https://yourproduct.com" maxLength={2048} className={`${inputClass} mt-2 font-normal`} /></label>
          <label className="min-w-0 text-sm font-semibold text-ink" htmlFor="product-pitch">One-line pitch <span className="text-accent">*</span><textarea id="product-pitch" required value={fields.pitch} onChange={(e) => updateFields({ pitch: e.target.value })} maxLength={140} rows={2} placeholder="What does your product help people do?" className={`${inputClass} mt-2 resize-y font-normal`} /><span className="mt-1 block text-right text-xs font-normal text-muted">{fields.pitch.length}/140</span></label>
          <label className="min-w-0 text-sm font-semibold text-ink" htmlFor="founder-x">Founder&apos;s X handle <span className="font-normal text-muted">(optional)</span><input id="founder-x" value={fields.xHandle} onChange={(e) => updateFields({ xHandle: e.target.value })} placeholder="@yourhandle" maxLength={200} className={`${inputClass} mt-2 font-normal`} /><span className="mt-2 block text-xs font-normal text-muted">Check that any detected handle belongs to your product or its founder.</span></label>
          <div className="rounded-xl border border-border bg-surface px-4"><button type="button" onClick={() => setShowBattleFields(!showBattleFields)} aria-expanded={showBattleFields} aria-controls="optional-battle-fields" className="flex min-h-12 w-full items-center justify-between gap-2 text-left text-sm font-semibold text-ink">Battle pitch &amp; extra details <span className="text-xs font-normal text-muted">Optional {showBattleFields ? "−" : "+"}</span></button>
            {showBattleFields && <div id="optional-battle-fields" className="grid min-w-0 gap-4 pb-4">
              <label htmlFor="battle-pitch" className="text-xs font-semibold text-ink">Battle pitch<input id="battle-pitch" value={fields.battlePitch} onChange={(e) => updateFields({ battlePitch: e.target.value })} maxLength={120} placeholder="What makes this the product to beat?" className={`${inputClass} mt-2 font-normal`} /></label>
              <label htmlFor="why-us" className="text-xs font-semibold text-ink">Why should voters choose you?<input id="why-us" value={fields.whyUs} onChange={(e) => updateFields({ whyUs: e.target.value })} maxLength={160} className={`${inputClass} mt-2 font-normal`} /></label>
              {fields.differentiators.map((value, i) => <label key={i} htmlFor={`differentiator-${i}`} className="text-xs font-semibold text-ink">Key differentiator {i + 1}<input id={`differentiator-${i}`} value={value} onChange={(e) => updateFields({ differentiators: fields.differentiators.map((d, index) => index === i ? e.target.value : d) })} maxLength={60} className={`${inputClass} mt-2 font-normal`} /></label>)}
            </div>}
          </div>
          <button type="submit" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-accent px-5 py-3 text-sm font-bold text-accent-ink hover:brightness-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">Continue to entry options<ArrowRight className="h-4 w-4" /></button>
        </fieldset>
      </form>}
    </> : <>
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-4 sm:p-5"><div className="min-w-0"><p className="break-words font-display font-bold text-ink">{fields.name}</p><p className="mt-1 break-all text-xs text-muted">{fields.url} · {fields.category}</p></div><button type="button" onClick={() => moveStep(1)} className={secondaryButton}><ArrowLeft className="h-4 w-4" />Edit details</button></div>
      <div><p className="text-xs font-bold uppercase tracking-wider text-accent">Step 2</p><h2 className="mt-1 font-display text-2xl font-bold text-ink">Choose how you enter.</h2><p className="mt-2 text-sm leading-relaxed text-muted">The same Arena. Two ways to get your product in.</p></div>
      <fieldset disabled={submitting} className="grid min-w-0 gap-4 sm:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-4 rounded-2xl border border-accent/40 bg-bg p-5 shadow-sm sm:p-6"><span className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent/10 text-accent"><Zap className="h-5 w-5" /></span><div><h3 className="font-display text-xl font-bold text-ink">Instant Entry</h3><p className="mt-3 font-display text-4xl font-black text-ink">$1 <span className="font-body text-xs font-normal text-muted">one-time</span></p></div><p className="flex-1 text-sm leading-relaxed text-muted">Skip the tasks and submit directly.</p><PayButton type="submit" endpoint="/api/submit/checkout" extraBody={currentFields()} onPaid={handlePaidSuccess} label="Submit for $1" className="flex min-h-12 w-full items-center justify-center rounded-xl bg-accent px-4 py-3 text-sm font-bold text-accent-ink hover:brightness-105 disabled:opacity-50" /><p className="text-xs leading-relaxed text-muted">Your product enters after payment is confirmed.</p></div>
        <div className="flex min-w-0 flex-col gap-4 rounded-2xl border border-border bg-bg p-5 shadow-sm sm:p-6"><span className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent-soft/20 text-accent"><Gift className="h-5 w-5" /></span><div><h3 className="font-display text-xl font-bold text-ink">Earn Your Spot</h3><p className="mt-3 font-display text-4xl font-black text-ink">Free</p></div><p className="flex-1 text-sm leading-relaxed text-muted">Discover startups, cast 5 votes, and leave 2 honest reviews.</p>
          {progressLoading ? <p role="status" className="text-xs text-muted">Checking your progress…</p> : eligible ? <p className="flex items-center gap-2 text-xs font-semibold text-accent"><CheckCircle2 className="h-4 w-4" />Free submission unlocked</p> : freeProgress ? <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted"><span>{freeProgress.votesTowardNext}/5 votes</span><span>{freeProgress.reviewsTowardNext}/2 reviews</span></div> : <p className="text-xs text-muted">Couldn&apos;t load your progress. Try refreshing it below.</p>}
          {eligible ? <button type="button" onClick={() => void submitFree()} disabled={submitting || progressLoading} className={secondaryButton}>{submitting ? "Submitting…" : "Submit for free"}</button> : <Link href="/live-battles" onClick={() => persist()} className={secondaryButton}>Earn Free Submission<ArrowRight className="h-4 w-4" /></Link>}
          <button type="button" disabled={progressLoading} onClick={refreshProgress} className="min-h-11 text-left text-xs font-semibold text-accent hover:underline disabled:opacity-50">Refresh progress</button>
        </div>
      </fieldset>
    </>}
    {error && <p role="alert" className="rounded-xl border border-danger/25 bg-danger/5 p-4 text-sm leading-relaxed text-danger">{error}</p>}
    <p role="status" className="flex items-start justify-center gap-2 px-2 text-center text-xs leading-relaxed text-muted"><LockKeyhole className="mt-0.5 h-3.5 w-3.5 shrink-0" />{draftMessage}</p>
  </section>;
}
