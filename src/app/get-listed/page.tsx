"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  ArrowRight,
  BarChart3,
  BriefcaseBusiness,
  Check,
  CheckCircle2,
  CirclePlay,
  FileCheck2,
  FileText,
  Gamepad2,
  ImageIcon,
  LayoutDashboard,
  Megaphone,
  MousePointerClick,
  SearchCheck,
  Send,
  Share2,
  ShieldCheck,
  Sparkles,
  Target,
  Video,
  Zap,
} from "lucide-react";
import { GetListedModal } from "@/components/GetListedModal";
import { CampaignResultsSection } from "@/components/get-listed/CampaignResultsSection";
import {
  GET_LISTED_PACKAGES,
  CURRENT_GET_LISTED_PACKAGE_KEYS,
  type CurrentGetListedPackageKey,
} from "@/lib/get-listed/packages";

type PackageContent = {
  tagline: string;
  audience: string;
  cta: string;
  badge?: string;
  features: string[];
};

const PACKAGE_CONTENT: Record<CurrentGetListedPackageKey, PackageContent> = {
  launch_starter: {
    tagline: "Give your product its first promotional push.",
    audience: "Affordable exposure without doing every promotional task yourself.",
    cta: "Start My Launch",
    features: [
      "15 relevant free directory submissions",
      "1 dedicated X product feature",
      "1 reusable promotional graphic",
      "7-day Get Listed showcase placement",
      "3 actionable positioning suggestions",
      "Report with links, status, and available metrics",
      "Delivery within 7 days",
    ],
  },
  growth_campaign: {
    tagline: "Turn your product into content people can discover.",
    audience: "Product demonstrations, social promotion, and wider distribution.",
    cta: "Grow My Product",
    badge: "Recommended",
    features: [
      "30 relevant free directory submissions",
      "3–5 minute YouTube screen-recorded demo",
      "2 X posts using different angles",
      "1 LinkedIn product feature",
      "1 reusable promotional graphic",
      "14-day Get Listed showcase placement",
      "5 researched distribution opportunities",
      "14-day report with available reach, engagement, and clicks",
    ],
  },
  launch_accelerator: {
    tagline: "Keep your product in front of potential users for longer.",
    audience: "A complete month-long promotional campaign across multiple formats.",
    cta: "Accelerate My Launch",
    features: [
      "45 relevant free directory submissions",
      "5–7 minute YouTube product walkthrough",
      "1 YouTube Short highlighting a standout feature",
      "4 X posts spread throughout the campaign",
      "2 LinkedIn product features with different angles",
      "2 reusable promotional graphics",
      "30-day Get Listed showcase placement",
      "Use-case spotlight and 10 distribution opportunities",
      "Mid-campaign update and final performance report",
    ],
  },
};

const HOW_IT_WORKS: Array<{ number: string; title: string; body: string; icon: LucideIcon }> = [
  { number: "01", title: "Choose your campaign", body: "Select the promotion package that fits your goals.", icon: Target },
  { number: "02", title: "Share your product", body: "Provide your URL, target audience, product details, and any necessary demo access.", icon: Send },
  { number: "03", title: "We promote it", body: "We create the agreed content, publish promotional posts, and complete relevant submissions.", icon: Megaphone },
  { number: "04", title: "Track your results", body: "Follow campaign progress and review the performance information available.", icon: BarChart3 },
];

const VALUE_ITEMS: Array<{ title: string; body: string; icon: LucideIcon }> = [
  { title: "YouTube product demos", body: "Give potential users a real look at your product instead of another sales pitch.", icon: Video },
  { title: "Social media promotion", body: "Introduce your product through different content angles across X and LinkedIn.", icon: Share2 },
  { title: "Directory distribution", body: "Save hours researching and submitting your product to relevant launch platforms.", icon: SearchCheck },
  { title: "Promotional graphics", body: "Get ready-to-share visuals you can reuse on your own channels.", icon: ImageIcon },
  { title: "Campaign tracking", body: "See what is complete, where your product was featured, and what results are available.", icon: FileCheck2 },
  { title: "Practical next steps", body: "Finish with researched opportunities and actions you can continue using after delivery.", icon: Sparkles },
];

const TRACKING_ITEMS = [
  "Campaign status",
  "Completed and pending deliverables",
  "Directory submission progress",
  "Published content links",
  "Available engagement metrics",
  "Final campaign report",
];

const FAQ = [
  { q: "Will I get guaranteed customers?", a: "No. We help increase your product's opportunities for discovery through content and distribution, but cannot guarantee visitors, signups, or sales." },
  { q: "Do I need to record a video?", a: "No. We create the screen-recorded demo using your product and the information or access you provide. No interview, video call, or live meeting is included." },
  { q: "Will every directory accept my product?", a: "No. We submit to relevant directories, but publication depends on each platform's review process." },
  { q: "Can I purchase without playing Discount Drop?", a: "Yes. The game is completely optional and every package can be purchased directly." },
  { q: "Will I own the promotional graphics?", a: "Yes. The finished graphics are provided for you to reuse in your own marketing." },
  { q: "How can I track my campaign?", a: "Your Get Listed dashboard shows fulfillment progress, published links, and available results." },
  { q: "Are these recurring subscriptions?", a: "No. All three packages are one-time campaigns." },
  { q: "How is promotional content handled?", a: "Sponsored content is disclosed where required. Posts and listings remain subject to each platform's moderation rules and may be edited or removed by that platform." },
];

function formatPrice(cents: number) {
  const dollars = cents / 100;
  return `$${dollars.toFixed(Number.isInteger(dollars) ? 0 : 2)}`;
}

export default function GetListedPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [activePackage, setActivePackage] = useState<CurrentGetListedPackageKey | null>(null);
  const [discountAward, setDiscountAward] = useState<{ id: string; discountPercent: number } | null>(null);

  useEffect(() => {
    const awardId = searchParams.get("discountAward");
    if (!awardId) return;
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
    const packageKey = searchParams.get("package");
    if (resume === "1" && CURRENT_GET_LISTED_PACKAGE_KEYS.includes(packageKey as CurrentGetListedPackageKey)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- restore the campaign form intentionally after the external sign-in redirect
      setActivePackage(packageKey as CurrentGetListedPackageKey);
      router.replace("/get-listed");
    }
  }, [searchParams, router]);

  return (
    <main className="overflow-hidden">
      <section className="relative border-b border-border px-6 py-20 md:px-10 lg:py-28">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_75%_25%,color-mix(in_srgb,var(--accent)_16%,transparent),transparent_34%),linear-gradient(to_bottom,transparent,var(--bg))]" />
        <div className="pointer-events-none absolute right-[8%] top-16 hidden h-72 w-72 rotate-6 rounded-[2.5rem] border border-accent/20 bg-accent/5 shadow-[0_0_80px_color-mix(in_srgb,var(--accent)_18%,transparent)] lg:block" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-14 lg:grid-cols-[1.15fr_.85fr]">
          <div className="flex flex-col items-start gap-6">
            <span className="inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-4 py-2 text-xs font-bold uppercase tracking-[0.16em] text-accent">
              <Megaphone className="h-4 w-4" /> Done-for-you product promotion
            </span>
            <div className="space-y-4">
              <h1 className="max-w-3xl font-display text-4xl font-black leading-[1.03] tracking-tight text-ink sm:text-5xl lg:text-6xl">
                Your product deserves more than a launch-day post.
              </h1>
              <p className="text-xl font-semibold text-ink sm:text-2xl">We help more people discover what you&apos;ve built.</p>
              <p className="max-w-2xl text-base leading-7 text-muted">
                Building your product was the hard part. Getting it noticed shouldn&apos;t be another full-time job. We create content that shows what your product does, share it across our channels, submit it to relevant directories, and give you a clear report of the work completed.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <a href="#campaigns" className="inline-flex h-12 items-center gap-2 rounded-xl bg-accent px-6 text-sm font-bold text-accent-ink shadow-lg transition hover:-translate-y-0.5">
                Explore Campaigns <ArrowRight className="h-4 w-4" />
              </a>
              <Link href="/get-listed/discount-drop" className="inline-flex h-12 items-center gap-2 rounded-xl border border-border bg-surface px-6 text-sm font-bold text-ink shadow-sm transition hover:border-accent">
                <Gamepad2 className="h-4 w-4 text-accent" /> Play Discount Drop
              </Link>
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted">
              <span className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-accent" /> One-time campaigns</span>
              <span className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-accent" /> Clear fulfillment tracking</span>
              <span className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-accent" /> No calls required</span>
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-md rounded-[2rem] border border-border bg-surface/90 p-5 shadow-2xl backdrop-blur">
            <div className="mb-5 flex items-center justify-between">
              <div><p className="text-xs font-bold uppercase tracking-widest text-accent">Campaign workspace</p><p className="mt-1 font-display text-lg font-bold text-ink">Everything in one place</p></div>
              <span className="rounded-full bg-[#16a34a]/10 px-3 py-1 text-xs font-bold text-[#16a34a]">In progress</span>
            </div>
            <div className="space-y-3">
              {[
                [CirclePlay, "Product demo", "Script and recording"],
                [Share2, "Social promotion", "X and LinkedIn"],
                [SearchCheck, "Distribution", "Relevant directories"],
                [FileText, "Campaign report", "Links and available results"],
              ].map(([Icon, title, body], index) => {
                const ItemIcon = Icon as LucideIcon;
                return <div key={String(title)} className="flex items-center gap-3 rounded-2xl border border-border bg-bg p-4"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10 text-accent"><ItemIcon className="h-5 w-5" /></div><div className="min-w-0 flex-1"><p className="text-sm font-bold text-ink">{String(title)}</p><p className="text-xs text-muted">{String(body)}</p></div><span className={`h-2.5 w-2.5 rounded-full ${index < 2 ? "bg-[#16a34a]" : "bg-accent/40"}`} /></div>;
              })}
            </div>
          </div>
        </div>
      </section>

      <section className="px-6 py-20 md:px-10">
        <div className="mx-auto max-w-6xl">
          <div className="mb-10 max-w-2xl"><p className="text-xs font-bold uppercase tracking-[0.2em] text-accent">How it works</p><h2 className="mt-3 font-display text-3xl font-black text-ink sm:text-4xl">From product details to completed promotion.</h2></div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {HOW_IT_WORKS.map(({ number, title, body, icon: Icon }) => <div key={number} className="relative rounded-2xl border border-border bg-surface p-6 shadow-sm"><span className="absolute right-5 top-4 font-display text-3xl font-black text-border">{number}</span><div className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl bg-accent/10 text-accent"><Icon className="h-5 w-5" /></div><h3 className="font-display text-base font-bold text-ink">{title}</h3><p className="mt-2 text-sm leading-6 text-muted">{body}</p></div>)}
          </div>
        </div>
      </section>

      <CampaignResultsSection />

      <section id="campaigns" className="scroll-mt-24 border-y border-border bg-surface-2/40 px-6 py-20 md:px-10">
        <div className="mx-auto max-w-6xl">
          <div className="mx-auto mb-12 max-w-2xl text-center"><p className="text-xs font-bold uppercase tracking-[0.2em] text-accent">Promotion campaigns</p><h2 className="mt-3 font-display text-3xl font-black text-ink sm:text-4xl">Choose how far you want to take your launch.</h2><p className="mt-3 text-sm leading-6 text-muted">Every package is a one-time purchase with specific deliverables, a clear timeline, and a campaign dashboard.</p></div>
          {discountAward && <div className="mx-auto mb-6 max-w-xl rounded-xl border border-accent bg-accent/10 px-5 py-3 text-center text-sm font-bold text-accent">Your {discountAward.discountPercent}% Discount Drop reward is ready and will be applied at checkout.</div>}
          <div className="grid items-stretch gap-5 lg:grid-cols-3">
            {CURRENT_GET_LISTED_PACKAGE_KEYS.map((key) => {
              const pkg = GET_LISTED_PACKAGES[key];
              const copy = PACKAGE_CONTENT[key];
              const discountedCents = discountAward ? Math.round(pkg.priceUsd * 100 * (1 - discountAward.discountPercent / 100)) : null;
              const recommended = key === "growth_campaign";
              return <article key={key} className={`relative flex flex-col rounded-[1.75rem] border p-6 shadow-sm ${recommended ? "border-accent bg-bg shadow-[0_18px_60px_color-mix(in_srgb,var(--accent)_16%,transparent)] lg:-translate-y-3" : "border-border bg-surface"}`}>
                {copy.badge && <span className="absolute right-5 top-5 rounded-full bg-accent px-3 py-1 text-[11px] font-black uppercase tracking-wider text-accent-ink">{copy.badge}</span>}
                <p className="pr-28 font-display text-xl font-black text-ink">{pkg.label}</p>
                <p className="mt-2 min-h-12 text-sm font-semibold leading-6 text-muted">{copy.tagline}</p>
                <div className="my-6 flex items-end gap-2"><span className={`font-display font-black ${discountedCents === null ? "text-4xl text-ink" : "text-lg text-muted line-through"}`}>${pkg.priceUsd}</span>{discountedCents !== null && <span className="font-display text-4xl font-black text-accent">{formatPrice(discountedCents)}</span>}<span className="pb-1 text-xs text-muted">one-time</span></div>
                <p className="mb-5 rounded-xl bg-surface-2 p-3 text-sm leading-5 text-muted">{copy.audience}</p>
                <ul className="flex flex-1 flex-col gap-3">
                  {copy.features.map((feature) => <li key={feature} className="flex gap-2.5 text-sm leading-5 text-ink"><Check className="mt-0.5 h-4 w-4 shrink-0 text-accent" />{feature}</li>)}
                </ul>
                <button onClick={() => setActivePackage(key)} className={`mt-7 inline-flex h-12 items-center justify-center gap-2 rounded-xl text-sm font-bold transition hover:-translate-y-0.5 ${recommended ? "bg-accent text-accent-ink shadow-lg" : "border border-border bg-bg text-ink hover:border-accent"}`}>{copy.cta}<ArrowRight className="h-4 w-4" /></button>
              </article>;
            })}
          </div>
        </div>
      </section>

      <section id="discount-drop" className="px-6 py-20 md:px-10">
        <div className="relative mx-auto max-w-6xl overflow-hidden rounded-[2rem] border border-accent/30 bg-[linear-gradient(135deg,color-mix(in_srgb,var(--accent)_15%,var(--surface)),var(--surface))] p-8 sm:p-12">
          <div className="pointer-events-none absolute -right-14 -top-14 h-64 w-64 rounded-full border-[30px] border-accent/10" />
          <div className="relative max-w-2xl"><span className="inline-flex items-center gap-2 rounded-full border border-accent/30 bg-bg/70 px-3 py-1 text-xs font-bold uppercase tracking-wider text-accent"><Zap className="h-3.5 w-3.5" /> Optional launch bonus</span><h2 className="mt-5 font-display text-3xl font-black text-ink sm:text-4xl">Your launch budget just got a power-up.</h2><p className="mt-4 max-w-xl text-base leading-7 text-muted">Play Discount Drop for a chance to unlock up to 60% off your promotion campaign. Your first attempt is free, results are verified by the server, and your reward has a visible two-minute claim window.</p><div className="mt-7 flex flex-wrap items-center gap-4"><Link href="/get-listed/discount-drop" className="inline-flex h-12 items-center gap-2 rounded-xl bg-accent px-6 text-sm font-bold text-accent-ink shadow-lg"><Gamepad2 className="h-4 w-4" /> Play for My Discount</Link><span className="text-sm text-muted">Prefer to skip the game? Choose any campaign above.</span></div></div>
        </div>
      </section>

      <section className="border-y border-border bg-surface px-6 py-20 md:px-10">
        <div className="mx-auto max-w-6xl"><div className="mb-10 max-w-2xl"><p className="text-xs font-bold uppercase tracking-[0.2em] text-accent">What your promotion looks like</p><h2 className="mt-3 font-display text-3xl font-black text-ink sm:text-4xl">Useful content, distribution, and proof of work.</h2><p className="mt-3 text-sm text-muted">The cards below are service previews, not fabricated customer campaigns or performance claims.</p></div><div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{VALUE_ITEMS.map(({ title, body, icon: Icon }) => <article key={title} className="rounded-2xl border border-border bg-bg p-6"><div className="mb-4 flex items-center justify-between"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent/10 text-accent"><Icon className="h-5 w-5" /></div><span className="rounded-full bg-surface-2 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-muted">Service preview</span></div><h3 className="font-display text-base font-bold text-ink">{title}</h3><p className="mt-2 text-sm leading-6 text-muted">{body}</p></article>)}</div></div>
      </section>

      <section className="px-6 py-20 md:px-10">
        <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-2">
          <div><p className="text-xs font-bold uppercase tracking-[0.2em] text-accent">Transparent campaign tracking</p><h2 className="mt-3 font-display text-3xl font-black text-ink sm:text-4xl">Know what is happening after checkout.</h2><p className="mt-4 text-base leading-7 text-muted">Your private Get Listed dashboard separates payment from fulfillment and records real work as it is completed. Metrics appear only when they are available.</p><ul className="mt-7 grid gap-3 sm:grid-cols-2">{TRACKING_ITEMS.map((item) => <li key={item} className="flex items-center gap-2 text-sm font-semibold text-ink"><CheckCircle2 className="h-4 w-4 text-accent" />{item}</li>)}</ul><Link href="/get-listed/campaigns" className="mt-8 inline-flex items-center gap-2 text-sm font-bold text-accent">Open Get Listed dashboard <ArrowRight className="h-4 w-4" /></Link></div>
          <div className="rounded-[1.75rem] border border-border bg-surface p-6 shadow-xl"><div className="flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-wider text-muted">Campaign progress</p><p className="mt-1 font-display text-lg font-bold text-ink">Growth Campaign</p></div><LayoutDashboard className="h-5 w-5 text-accent" /></div><div className="mt-6 h-2 overflow-hidden rounded-full bg-surface-2"><div className="h-full w-3/5 rounded-full bg-accent" /></div><div className="mt-2 flex justify-between text-xs text-muted"><span>Work completed</span><span>Tracked from actual updates</span></div><div className="mt-6 space-y-3">{[[CirclePlay,"YouTube product demo","In progress"],[Send,"Directory submissions","12 of 30"],[BriefcaseBusiness,"LinkedIn feature","Pending"],[FileText,"Campaign report","Pending"]].map(([Icon,title,status],index)=>{const ItemIcon=Icon as LucideIcon;return <div key={String(title)} className="flex items-center gap-3 rounded-xl border border-border bg-bg p-3"><ItemIcon className="h-4 w-4 text-accent" /><span className="flex-1 text-sm font-semibold text-ink">{String(title)}</span><span className={`text-xs ${index===0?"text-accent":"text-muted"}`}>{String(status)}</span></div>;})}</div><p className="mt-4 text-center text-[11px] text-muted">Illustrative dashboard preview</p></div>
        </div>
      </section>

      <section className="border-y border-border bg-surface px-6 py-20 md:px-10"><div className="mx-auto max-w-3xl"><div className="mb-9 text-center"><p className="text-xs font-bold uppercase tracking-[0.2em] text-accent">Frequently asked questions</p><h2 className="mt-3 font-display text-3xl font-black text-ink">Clear expectations before you buy.</h2></div><div className="space-y-3">{FAQ.map((item)=><details key={item.q} className="group rounded-2xl border border-border bg-bg p-5"><summary className="cursor-pointer list-none pr-6 text-sm font-bold text-ink">{item.q}</summary><p className="mt-3 text-sm leading-6 text-muted">{item.a}</p></details>)}</div></div></section>

      <section className="px-6 py-20 text-center md:px-10"><div className="mx-auto flex max-w-2xl flex-col items-center"><MousePointerClick className="h-8 w-8 text-accent" /><h2 className="mt-5 font-display text-3xl font-black text-ink sm:text-4xl">You built something worth showing. Let&apos;s get it seen.</h2><p className="mt-4 text-base text-muted">Choose your campaign, share your product, and let us handle the promotional work.</p><a href="#campaigns" className="mt-7 inline-flex h-12 items-center gap-2 rounded-xl bg-accent px-7 text-sm font-bold text-accent-ink shadow-lg">Get My Product Promoted <ArrowRight className="h-4 w-4" /></a><div className="mt-7 flex items-start gap-2 rounded-xl border border-border bg-surface px-4 py-3 text-left text-xs text-muted"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-accent" /><span>Promotion increases opportunities for discovery. It does not guarantee traffic, customers, sales, directory approval, rankings, or continued publication on third-party platforms.</span></div></div></section>

      {activePackage && <GetListedModal open onClose={() => setActivePackage(null)} packageKey={activePackage} discountAward={discountAward} />}
    </main>
  );
}
