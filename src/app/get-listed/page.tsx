"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ClipboardList, Gamepad2, ShieldCheck, Send, CheckCircle2 } from "lucide-react";
import { GetListedModal } from "@/components/GetListedModal";
import { GET_LISTED_PACKAGES, type GetListedPackageKey } from "@/lib/get-listed/packages";

const PACKAGE_ORDER: GetListedPackageKey[] = ["starter", "growth", "scale"];

const STEPS = [
  { title: "Choose a package", body: "Pick how many directories you want your product manually submitted to." },
  { title: "We do the work", body: "Our team hand-submits your product to relevant, real directories — no bots." },
  { title: "Track your report", body: "Every submission is logged with its status, so you always know where things stand." },
  { title: "Get listed", body: "Approved submissions go live on the directory's own timeline — outside our control." },
];

const FAQ = [
  {
    q: "Is a listing guaranteed?",
    a: "No. This package covers manual submission work, not guaranteed approval. Each directory reviews submissions under its own policies and can accept, reject, or ignore any listing.",
  },
  {
    q: "How long does it take?",
    a: "It varies by directory — some review in days, others take weeks. Your campaign report shows the real status of every submission as it changes.",
  },
  {
    q: "What counts as a submission?",
    a: "One real, manually-performed submission to one directory. Your progress (e.g. 37/60) always reflects actual submissions made, never a placeholder.",
  },
  {
    q: "What is Discount Drop?",
    a: "An optional mini-game that can unlock a discount on your package before you pay. It's coming soon — for now, every package is available at full price.",
  },
];

export default function GetListedPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [activePackage, setActivePackage] = useState<GetListedPackageKey | null>(null);

  useEffect(() => {
    const resume = searchParams.get("resume");
    const pkg = searchParams.get("package");
    if (resume === "1" && pkg && pkg in GET_LISTED_PACKAGES) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reopening the campaign form the visitor started before signing in, not a render-driven derivation
      setActivePackage(pkg as GetListedPackageKey);
      router.replace("/get-listed");
    }
  }, [searchParams, router]);

  return (
    <main className="flex flex-col">
      {/* Hero */}
      <section className="relative overflow-hidden px-6 pb-14 pt-16 text-center sm:pt-24">
        <div className="relative mx-auto flex max-w-3xl flex-col items-center gap-6">
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
            Manual submissions · Real work · Clear reporting
          </span>
          <h1 className="font-display text-4xl font-black leading-[1.08] text-ink sm:text-6xl">
            Get your product
            <br />
            <span className="text-accent">listed.</span>
          </h1>
          <p className="max-w-lg text-base text-muted sm:text-lg">
            We manually submit your product to relevant directories and give you a clear report of every
            submission.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <a
              href="#packages"
              className="rounded-lg bg-accent px-6 py-3 text-sm font-semibold text-accent-ink shadow-md transition-all duration-150 ease-out hover:-translate-y-0.5 hover:shadow-lg active:scale-95"
            >
              Choose a Package
            </a>
            <a
              href="#discount-drop"
              className="flex items-center gap-2 rounded-lg border border-border bg-surface px-6 py-3 text-sm font-semibold text-ink shadow-sm transition-all duration-150 ease-out hover:-translate-y-0.5 hover:shadow-md active:scale-95"
            >
              <Gamepad2 className="h-4 w-4 text-accent" />
              Play &amp; Unlock Discount
            </a>
          </div>
          <p className="text-xs text-muted">Optional. Buy at full price anytime.</p>
        </div>
      </section>

      {/* Packages */}
      <section id="packages" className="border-t border-border px-6 py-16 md:px-10">
        <div className="mx-auto flex max-w-5xl flex-col gap-8">
          <div className="flex flex-col items-center gap-2 text-center">
            <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">Packages</h2>
            <p className="text-sm text-muted">One-time price. No subscriptions.</p>
          </div>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
            {PACKAGE_ORDER.map((key) => {
              const pkg = GET_LISTED_PACKAGES[key];
              const featured = key === "growth";
              return (
                <div
                  key={key}
                  className={`flex flex-col gap-4 rounded-2xl border p-6 shadow-sm ${featured ? "border-accent bg-accent-soft/10" : "border-border bg-surface"}`}
                >
                  {featured && (
                    <span className="w-fit rounded-full bg-accent px-2.5 py-0.5 text-xs font-semibold text-accent-ink">
                      Most popular
                    </span>
                  )}
                  <h3 className="font-display text-xl font-bold text-ink">{pkg.label}</h3>
                  <div className="flex items-baseline gap-1">
                    <span className="font-display text-3xl font-black text-ink">${pkg.priceUsd}</span>
                  </div>
                  <p className="text-sm text-muted">{pkg.target} manual directory submissions</p>
                  <button
                    onClick={() => setActivePackage(key)}
                    className="mt-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-accent-ink shadow-sm transition-all duration-150 ease-out hover:-translate-y-0.5 hover:shadow-md active:scale-95"
                  >
                    Get Listed
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Discount Drop teaser */}
      <section id="discount-drop" className="border-t border-border px-6 py-16 text-center md:px-10">
        <div className="mx-auto flex max-w-xl flex-col items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full border border-border bg-surface text-accent">
            <Gamepad2 className="h-6 w-6" />
          </div>
          <span className="rounded-full border border-border bg-surface px-3 py-1 text-xs font-semibold uppercase tracking-wide text-muted">
            Coming soon
          </span>
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">Discount Drop</h2>
          <p className="text-sm text-muted">
            A quick, optional mini-game that can unlock a discount on your package before checkout. It&apos;s not
            live yet — every package above is available at full price right now, and playing is never required to
            get listed.
          </p>
        </div>
      </section>

      {/* How it works */}
      <section className="border-t border-border px-6 py-16 md:px-10">
        <div className="mx-auto flex max-w-5xl flex-col gap-8">
          <h2 className="text-center font-display text-2xl font-bold text-ink sm:text-3xl">How it works</h2>
          <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((step, i) => (
              <div key={step.title} className="flex flex-col items-center gap-3 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full border border-border bg-surface text-accent">
                  <ClipboardList className="h-6 w-6" />
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-semibold uppercase tracking-wide text-accent">Step {i + 1}</span>
                  <h3 className="font-display text-sm font-bold text-ink">{step.title}</h3>
                  <p className="text-xs text-muted">{step.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Disclosure / FAQ */}
      <section className="border-t border-border px-6 py-16 md:px-10">
        <div className="mx-auto flex max-w-3xl flex-col gap-8">
          <div className="flex items-start gap-3 rounded-xl border border-border bg-surface p-5">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
            <p className="text-sm text-muted">
              <strong className="text-ink">This package covers manual submission work, not guaranteed live
              listings.</strong> Third-party directories control their own approval decisions, review times,
              policies, and rejections — we can&apos;t influence or speed those up.
            </p>
          </div>
          <div className="flex flex-col gap-4">
            <h2 className="text-center font-display text-2xl font-bold text-ink sm:text-3xl">FAQ</h2>
            {FAQ.map((item) => (
              <div key={item.q} className="rounded-xl border border-border bg-surface p-5">
                <h3 className="font-display text-sm font-bold text-ink">{item.q}</h3>
                <p className="mt-1 text-sm text-muted">{item.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-border px-6 py-16 text-center">
        <div className="mx-auto flex max-w-xl flex-col items-center gap-4">
          <CheckCircle2 className="h-8 w-8 text-accent" />
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">Ready to get listed?</h2>
          <p className="text-sm text-muted">Pick a package and we&apos;ll start submitting your product.</p>
          <a
            href="#packages"
            className="flex items-center gap-2 rounded-lg bg-accent px-6 py-3 text-sm font-semibold text-accent-ink shadow-md transition-all duration-150 ease-out hover:-translate-y-0.5 hover:shadow-lg active:scale-95"
          >
            <Send className="h-4 w-4" />
            Choose a Package
          </a>
        </div>
      </section>

      {activePackage && (
        <GetListedModal open onClose={() => setActivePackage(null)} packageKey={activePackage} />
      )}
    </main>
  );
}
