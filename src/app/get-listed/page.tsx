"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ShieldCheck,
  CheckCircle2,
  Zap,
  ArrowRight,
  Target,
  Swords,
  Search,
  Send,
  FileText,
  Clock,
  Crosshair,
  Eye,
  FileCheck,
  Activity,
  Link2,
  Gamepad2,
} from "lucide-react";
import { GetListedModal } from "@/components/GetListedModal";
import { GetListedHeroArt } from "@/components/GetListedHeroArt";
import { CrownIcon } from "@/components/icons";
import { GET_LISTED_PACKAGES, type GetListedPackageKey } from "@/lib/get-listed/packages";

const PACKAGE_ORDER: GetListedPackageKey[] = ["starter", "growth", "scale"];

/**
 * Display-only Arena identity for each package (names, copy, icon). The
 * actual pricing, submission target, and packageKey sent to the backend
 * all still come from GET_LISTED_PACKAGES / GetListedModal, exactly as
 * before, so this never has to stay in sync with a second source of truth.
 */
const PACKAGE_COPY: Record<
  GetListedPackageKey,
  {
    icon: React.ComponentType<{ className?: string }>;
    roundLabel: string;
    description: string;
    features: string[];
    ctaLabel: string;
    tagline: string;
    featured?: boolean;
  }
> = {
  starter: {
    icon: Target,
    roundLabel: "Round 01",
    description: "Get your product on the map.",
    features: [
      "Manual submission to 30+ relevant directories",
      "Directories matched to your product and category",
      "We handle the submission work",
      "Submission tracking",
      "Listing URLs collected where published",
      "Final campaign report",
      "Save 15+ hours of repetitive work",
    ],
    ctaLabel: "Enter the Arena",
    tagline: "Make your first move.",
  },
  growth: {
    icon: Swords,
    roundLabel: "Round 02",
    description: "Turn visibility into momentum.",
    features: [
      "Manual submission to 60+ relevant directories",
      "Niche-matched directory research",
      "We handle research and submission work",
      "Full submission tracking",
      "Listing URLs collected where published",
      "Detailed final campaign report",
      "Save 30+ hours of manual work",
      "Expand your product's directory footprint",
    ],
    ctaLabel: "Get More Exposure",
    tagline: "More reach. More opportunities.",
    featured: true,
  },
  scale: {
    icon: CrownIcon,
    roundLabel: "Final Round",
    description: "Go all in on distribution.",
    features: [
      "Manual submission to 120+ relevant directories",
      "Extensive category and niche targeting",
      "Research, submission, and tracking handled for you",
      "Full campaign dashboard",
      "Listing URLs collected where published",
      "Comprehensive final report",
      "Save 60+ hours of repetitive work",
      "Maximize your product's directory footprint",
    ],
    ctaLabel: "Enter Champion Mode",
    tagline: "Push distribution further.",
  },
};

const HOW_IT_WORKS = [
  {
    number: "01",
    title: "Find",
    icon: Search,
    body: "We identify directories relevant to your product, category, and audience.",
  },
  {
    number: "02",
    title: "Submit",
    icon: Send,
    body: "We manually submit your product to the selected directories.",
  },
  {
    number: "03",
    title: "Report",
    icon: FileText,
    body: "You get submission tracking, listing URLs where available, and a final campaign report.",
  },
];

const REAL_VALUE = [
  { icon: Clock, title: "Less manual work", body: "We handle repetitive submissions." },
  { icon: Crosshair, title: "Better targeting", body: "Directories are selected around your product and category." },
  { icon: Eye, title: "Full visibility", body: "Track submission status and published URLs." },
  { icon: FileCheck, title: "Proof of work", body: "Receive a final campaign report." },
];

const WHAT_YOU_GET = [
  { icon: Send, title: "Manual submissions", body: "Relevant directories selected for your product." },
  { icon: Activity, title: "Tracking", body: "Know where each submission stands." },
  { icon: Link2, title: "Listing URLs", body: "Keep the links to published listings where available." },
  { icon: FileText, title: "Final report", body: "A clean record of the campaign when the work is complete." },
];

const PROMISES = [
  "Manual submissions",
  "Relevant directory research",
  "Submission tracking",
  "Listing URLs where published",
  "Final campaign report",
];

const FAQ = [
  {
    q: "Is a listing guaranteed?",
    a: "No. This package covers manual submission work, not guaranteed approval. Each directory reviews submissions under its own policies and can accept, reject, or ignore any listing.",
  },
  {
    q: "How long does it take?",
    a: "It varies by directory: some review in days, others take weeks. Your campaign report shows the real status of every submission as it changes.",
  },
  {
    q: "What counts as a submission?",
    a: "One real, manually-performed submission to one directory. Your progress (e.g. 37/60) always reflects actual submissions made, never a placeholder.",
  },
  {
    q: "What is Discount Drop?",
    a: "An optional 45-second reaction game (hit the targets, avoid the decoys) that can unlock up to 60% off your package. Your score is verified server-side, so the discount is always based on real performance. Playing is never required to get listed.",
  },
];

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-1.5 text-xs font-bold uppercase tracking-wide text-muted">
      {children}
    </span>
  );
}

export default function GetListedPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [activePackage, setActivePackage] = useState<GetListedPackageKey | null>(null);
  const [discountAward, setDiscountAward] = useState<{ id: string; discountPercent: number } | null>(null);

  useEffect(() => {
    const awardId = searchParams.get("discountAward");
    if (!awardId) return;
    // Re-fetched from the server, not trusted from the URL — the id is
    // just "which award to look up," the amount always comes from
    // /status's own record of it. Campaign creation re-validates this
    // award again from scratch regardless (ownership, available, not
    // expired), so this is purely a display convenience.
    fetch("/api/get-listed/discount-drop/status")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.activeAward?.id === awardId) {
          setDiscountAward({ id: data.activeAward.id, discountPercent: data.activeAward.discount_percent });
        }
      })
      .catch(() => {});
  }, [searchParams]);

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
      {/* Preload whichever theme's hero artwork actually applies — React
          hoists <link> tags rendered anywhere in the tree into <head>, so
          this works from a Client Component with no separate layout
          change. The `media` attribute means only the matching one is
          ever fetched, never both. */}
      <link rel="preload" as="image" href="/listingheroright.webp" media="(prefers-color-scheme: light)" />
      <link rel="preload" as="image" href="/listingherodarkright.webp" media="(prefers-color-scheme: dark)" />

      {/* Hero */}
      <section className="relative overflow-hidden pb-14 pt-14 sm:pt-20 lg:min-h-[600px] lg:pb-0 lg:pt-0">
        {/* Desktop: artwork bleeds edge-to-edge across the section's full
            height on the right side — sized against the section, not the
            padded/centered grid below, so it can never leave a gap above,
            below, or to the right of itself regardless of how tall the
            text column gets. */}
        <div className="absolute inset-y-0 right-0 hidden w-[55%] lg:block">
          <GetListedHeroArt />
        </div>

        <div className="relative mx-auto grid max-w-7xl grid-cols-1 items-center gap-10 px-6 sm:px-10 lg:grid-cols-[45%_55%] lg:gap-8 lg:min-h-[600px] lg:py-20">
          {/* Left: message */}
          <div className="flex min-w-0 flex-col items-center gap-6 text-center lg:items-start lg:text-left">
            <Eyebrow>
              <Zap className="h-3.5 w-3.5 shrink-0 text-accent" />
              Founder Distribution
            </Eyebrow>
            <h1 className="font-display text-4xl font-black uppercase leading-[1.05] tracking-tight text-ink sm:text-5xl lg:text-6xl">
              Put your product
              <br />
              <span className="text-accent">everywhere it matters.</span>
            </h1>
            <p className="max-w-md text-base text-muted sm:text-lg">
              We handle the directory research, submissions, and tracking. You focus on building. We handle the
              distribution.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3 lg:justify-start">
              <a
                href="#packages"
                className="flex items-center gap-2 rounded-lg bg-accent px-6 py-3 text-sm font-bold uppercase tracking-wide text-accent-ink shadow-md transition-all duration-150 ease-out hover:-translate-y-0.5 hover:shadow-lg active:scale-95"
              >
                Get Listed
                <ArrowRight className="h-4 w-4" />
              </a>
              <Link
                href="/get-listed/discount-drop"
                className="flex items-center gap-2 rounded-lg border border-border bg-surface px-6 py-3 text-sm font-bold uppercase tracking-wide text-ink shadow-sm transition-all duration-150 ease-out hover:-translate-y-0.5 hover:shadow-md active:scale-95"
              >
                <Gamepad2 className="h-4 w-4 text-accent" />
                Play Discount Drop
              </Link>
            </div>

            {/* Value strip */}
            <div className="grid w-full max-w-md grid-cols-3 gap-px overflow-hidden rounded-xl border border-border bg-border">
              {[
                { value: "30+", label: "Directories" },
                { value: "60+", label: "Hours Saved" },
                { value: "100%", label: "Manual Submission" },
              ].map((stat) => (
                <div key={stat.label} className="flex flex-col items-center gap-0.5 bg-surface px-2 py-3.5 text-center">
                  <span className="font-mono text-lg font-bold text-ink sm:text-xl">{stat.value}</span>
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">{stat.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Mobile/tablet: no room for a full-bleed side layer once the
              layout stacks, so the artwork renders inline here instead —
              the lg:block layer above takes over at the two-column
              breakpoint (lg:hidden keeps this one from doubling up). */}
          <div className="relative min-h-[260px] w-full min-w-0 sm:min-h-[360px] lg:hidden">
            <GetListedHeroArt />
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="border-t border-border px-6 py-16 md:px-10">
        <div className="mx-auto flex max-w-5xl flex-col gap-10">
          <h2 className="text-center font-display text-2xl font-black uppercase tracking-tight text-ink sm:text-3xl">
            How it works
          </h2>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
            {HOW_IT_WORKS.map((step) => (
              <div
                key={step.number}
                className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-6 shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-3xl font-black text-border">{step.number}</span>
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent-soft/20 text-accent">
                    <step.icon className="h-5 w-5" />
                  </div>
                </div>
                <h3 className="font-display text-base font-bold uppercase tracking-wide text-ink">{step.title}</h3>
                <p className="text-sm text-muted">{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Packages */}
      <section id="packages" className="border-t border-border px-6 py-16 md:px-10">
        <div className="mx-auto flex max-w-6xl flex-col gap-10">
          <div className="flex flex-col items-center gap-3 text-center">
            <Eyebrow>
              <Zap className="h-3.5 w-3.5 text-accent" />
              Choose Your Level
            </Eyebrow>
            <h2 className="font-display text-3xl font-black uppercase tracking-tight text-ink sm:text-4xl">
              How far do you want to take it?
            </h2>
            <p className="max-w-xl text-sm text-muted sm:text-base">
              Pick the distribution level that fits your product. Every package includes manual submissions,
              relevant directories, tracking, and a final report.
            </p>
            {discountAward && (
              <span className="mt-1 rounded-full bg-accent px-3 py-1 text-xs font-semibold text-accent-ink">
                {discountAward.discountPercent}% off ready. Pick a package below to apply it.
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
            {PACKAGE_ORDER.map((key) => {
              const pkg = GET_LISTED_PACKAGES[key];
              const copy = PACKAGE_COPY[key];
              const Icon = copy.icon;
              const featured = copy.featured === true;
              const discountedPrice = discountAward
                ? Math.round(pkg.priceUsd * (1 - discountAward.discountPercent / 100))
                : null;

              return (
                <div
                  key={key}
                  className={`relative flex flex-col gap-5 overflow-hidden rounded-2xl border p-6 sm:p-7 ${
                    featured
                      ? "border-accent/40 bg-black text-white shadow-lg sm:-translate-y-3"
                      : "border-border bg-surface text-ink shadow-sm"
                  }`}
                >
                  <span
                    className={`absolute right-4 top-4 font-mono text-[10px] uppercase tracking-widest ${
                      featured ? "text-white/30" : "text-muted/60"
                    }`}
                  >
                    {copy.roundLabel}
                  </span>

                  <div className="flex items-center justify-between">
                    <div
                      className={`flex h-11 w-11 items-center justify-center rounded-xl ${
                        featured ? "bg-white/10 text-accent" : "bg-accent-soft/20 text-accent"
                      }`}
                    >
                      <Icon className="h-5 w-5" />
                    </div>
                    {featured && (
                      <span className="flex items-center gap-1 rounded-full bg-accent px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-accent-ink">
                        <Zap className="h-3 w-3" />
                        Most popular
                      </span>
                    )}
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <h3 className="font-display text-2xl font-black uppercase tracking-tight">{pkg.arenaName}</h3>
                    <p className={`text-sm ${featured ? "text-white/70" : "text-muted"}`}>{copy.description}</p>
                  </div>

                  <span
                    className={`w-fit rounded-full border px-3 py-1 text-xs font-semibold ${
                      featured ? "border-white/20 text-white/80" : "border-border text-muted"
                    }`}
                  >
                    {pkg.target}+ targeted directories
                  </span>

                  <div className={`flex flex-col gap-1 border-t pt-4 ${featured ? "border-white/10" : "border-border"}`}>
                    <div className="flex items-baseline gap-2">
                      {discountedPrice !== null ? (
                        <>
                          <span className={`text-lg line-through ${featured ? "text-white/40" : "text-muted"}`}>
                            ${pkg.priceUsd}
                          </span>
                          <span className="font-display text-4xl font-black text-accent">${discountedPrice}</span>
                        </>
                      ) : (
                        <span className="font-display text-4xl font-black">${pkg.priceUsd}</span>
                      )}
                    </div>
                    <span className={`text-xs font-semibold uppercase tracking-wide ${featured ? "text-white/40" : "text-muted"}`}>
                      {discountAward ? `${discountAward.discountPercent}% off, one-time` : "One-time"}
                    </span>
                  </div>

                  <ul className="flex flex-col gap-2">
                    {copy.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2 text-sm">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>

                  <button
                    onClick={() => setActivePackage(key)}
                    className="mt-1 flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 py-3 text-sm font-bold uppercase tracking-wide text-accent-ink shadow-sm transition-all duration-150 ease-out hover:-translate-y-0.5 hover:shadow-md active:scale-95"
                  >
                    {discountAward ? `Use ${discountAward.discountPercent}% discount` : copy.ctaLabel}
                    <ArrowRight className="h-4 w-4" />
                  </button>

                  <p className={`text-center text-xs leading-relaxed ${featured ? "text-white/40" : "text-muted"}`}>
                    {copy.tagline}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Real value */}
      <section className="border-t border-border px-6 py-16 md:px-10">
        <div className="mx-auto flex max-w-5xl flex-col gap-10">
          <div className="flex flex-col items-center gap-3 text-center">
            <h2 className="font-display text-3xl font-black uppercase tracking-tight text-ink sm:text-4xl">
              Stop doing distribution by hand.
            </h2>
            <p className="max-w-xl text-sm text-muted sm:text-base">
              Finding directories, filling forms, and tracking submissions can eat hours of founder time. We take
              the repetitive work off your plate and give you a clear record of what was submitted.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {REAL_VALUE.map((item) => (
              <div key={item.title} className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-5 shadow-sm">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-soft/20 text-accent">
                  <item.icon className="h-5 w-5" />
                </div>
                <h3 className="font-display text-sm font-bold uppercase tracking-wide text-ink">{item.title}</h3>
                <p className="text-xs text-muted">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* What you get */}
      <section className="border-t border-border bg-surface px-6 py-16 md:px-10">
        <div className="mx-auto flex max-w-5xl flex-col gap-10">
          <h2 className="text-center font-display text-3xl font-black uppercase tracking-tight text-ink sm:text-4xl">
            You don&apos;t just get submissions.
          </h2>
          <div className="grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
            {WHAT_YOU_GET.map((item) => (
              <div key={item.title} className="flex flex-col gap-2 bg-bg p-6">
                <item.icon className="h-5 w-5 text-accent" />
                <h3 className="font-display text-sm font-bold uppercase tracking-wide text-ink">{item.title}</h3>
                <p className="text-xs text-muted">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Discount Drop */}
      <section id="discount-drop" className="border-t border-border px-6 py-16 text-center md:px-10">
        <div className="mx-auto flex max-w-xl flex-col items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full border border-border bg-surface text-accent">
            <Gamepad2 className="h-6 w-6" />
          </div>
          <span className="rounded-full border border-border bg-surface px-3 py-1 text-xs font-semibold uppercase tracking-wide text-muted">
            Optional
          </span>
          <h2 className="font-display text-2xl font-black uppercase tracking-tight text-ink sm:text-3xl">
            Play. Score. Save.
          </h2>
          <p className="text-sm text-muted">
            Think you can earn a better price? Play Discount Drop and unlock a temporary discount for your Get
            Listed package. Every score is verified server-side, and playing is never required, every package above
            is always available at full price.
          </p>
          <Link
            href="/get-listed/discount-drop"
            className="flex items-center gap-2 rounded-lg bg-accent px-6 py-3 text-sm font-bold uppercase tracking-wide text-accent-ink shadow-md transition-all duration-150 ease-out hover:-translate-y-0.5 hover:shadow-lg active:scale-95"
          >
            <Gamepad2 className="h-4 w-4" />
            Play Discount Drop
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      {/* Trust / expectations */}
      <section className="border-t border-border px-6 py-16 md:px-10">
        <div className="mx-auto flex max-w-3xl flex-col gap-6">
          <h2 className="text-center font-display text-2xl font-black uppercase tracking-tight text-ink sm:text-3xl">
            What we actually promise
          </h2>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {PROMISES.map((item) => (
              <li key={item} className="flex items-center gap-2 rounded-xl border border-border bg-surface p-4 text-sm text-ink">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-accent" />
                {item}
              </li>
            ))}
          </ul>
          <div className="flex items-start gap-3 rounded-xl border border-border bg-surface p-5">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
            <p className="text-sm text-muted">
              Directory acceptance and publication are controlled by third-party platforms, so we do not guarantee
              that every submission will be accepted or published.
            </p>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="border-t border-border px-6 py-16 md:px-10">
        <div className="mx-auto flex max-w-3xl flex-col gap-4">
          <h2 className="text-center font-display text-2xl font-black uppercase tracking-tight text-ink sm:text-3xl">
            FAQ
          </h2>
          {FAQ.map((item) => (
            <div key={item.q} className="rounded-xl border border-border bg-surface p-5">
              <h3 className="font-display text-sm font-bold text-ink">{item.q}</h3>
              <p className="mt-1 text-sm text-muted">{item.a}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Final CTA */}
      <section className="border-t border-border px-6 py-16 text-center">
        <div className="mx-auto flex max-w-xl flex-col items-center gap-4">
          <Swords className="h-8 w-8 text-accent" />
          <h2 className="font-display text-3xl font-black uppercase tracking-tight text-ink sm:text-4xl">
            Ready to enter the Arena?
          </h2>
          <p className="text-sm text-muted">Pick your package. We&apos;ll handle the distribution work.</p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <a
              href="#packages"
              className="flex items-center gap-2 rounded-lg bg-accent px-6 py-3 text-sm font-bold uppercase tracking-wide text-accent-ink shadow-md transition-all duration-150 ease-out hover:-translate-y-0.5 hover:shadow-lg active:scale-95"
            >
              Get Listed
              <ArrowRight className="h-4 w-4" />
            </a>
            <Link
              href="/get-listed/discount-drop"
              className="flex items-center gap-2 rounded-lg border border-border bg-surface px-6 py-3 text-sm font-bold uppercase tracking-wide text-ink shadow-sm transition-all duration-150 ease-out hover:-translate-y-0.5 hover:shadow-md active:scale-95"
            >
              <Gamepad2 className="h-4 w-4 text-accent" />
              Play Discount Drop
            </Link>
          </div>
        </div>
      </section>

      {activePackage && (
        <GetListedModal
          open
          onClose={() => setActivePackage(null)}
          packageKey={activePackage}
          discountAward={discountAward}
        />
      )}
    </main>
  );
}
