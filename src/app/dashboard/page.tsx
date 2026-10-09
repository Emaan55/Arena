"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Bell,
  Box,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Eye,
  Lightbulb,
  LoaderCircle,
  MessageSquareText,
  MousePointer2,
  Search,
  Swords,
  Trophy,
} from "lucide-react";
import { ProductAvatar } from "@/components/ProductAvatar";

type Analytics = {
  page_views: number;
  unique_page_views: number;
  outbound_clicks: number;
  unique_outbound_clicks: number;
};

type Match = {
  id: string;
  status: string;
  votes_a: number;
  votes_b: number;
  product_a_id: string;
  product_b_id: string;
  product_a: { id: string; name: string };
  product_b: { id: string; name: string };
};

type Product = {
  id: string;
  name: string;
  url: string;
  category: string;
  logo_url: string | null;
  status: string;
  wins: number;
  losses: number;
  votesReceived: number;
  reviews: number;
  analytics: Analytics;
  currentMatch: Match | null;
};

type ClaimCandidate = {
  id: string;
  name: string;
  url: string;
  status: string;
  claim: { status: string } | null;
};

type ActivityItem = {
  id: string;
  event_type: string;
  title: string;
  body: string;
  href: string;
  read_at: string | null;
  created_at: string;
};

type AnalyticsPoint = {
  day: string;
  page_views: number;
  outbound_clicks: number;
  votes: number;
};

type DashboardData = {
  founder: { name: string };
  products: Product[];
  claims: { product_id: string; status: string }[];
  campaigns: { id: string; startup_name: string; status: string; submission_target: number }[];
  activity: ActivityItem[];
  analyticsHistory: AnalyticsPoint[];
  unreadCount: number;
};

const number = new Intl.NumberFormat("en-US");

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");
  const [claimProof, setClaimProof] = useState<Record<string, string>>({});
  const [claiming, setClaiming] = useState<string | null>(null);
  const [claimQuery, setClaimQuery] = useState("");
  const [claimCandidates, setClaimCandidates] = useState<ClaimCandidate[]>([]);
  const [searchingClaims, setSearchingClaims] = useState(false);

  async function load() {
    const response = await fetch("/api/dashboard", { cache: "no-store" });
    if (response.status === 401) {
      setError("Sign in to see products linked to your account.");
      return;
    }
    const result = await response.json();
    if (!response.ok) {
      setError(result.error ?? "Could not load dashboard.");
      return;
    }
    setData(result);
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect -- Load server data after mount.
  useEffect(() => { void load(); }, []);

  async function runClaimSearch(query: string) {
    if (query.trim().length < 2) return;
    setSearchingClaims(true);
    const response = await fetch(`/api/dashboard/claims?q=${encodeURIComponent(query.trim())}`, { cache: "no-store" });
    const result = await response.json();
    if (response.ok) {
      const claims = result.claims as { product_id: string; status: string }[];
      setClaimCandidates((result.products as Omit<ClaimCandidate, "claim">[]).map((product) => ({
        ...product,
        claim: claims.find((claim) => claim.product_id === product.id) ?? null,
      })));
    } else {
      setError(result.error ?? "Could not search legacy products.");
    }
    setSearchingClaims(false);
  }

  async function searchClaims(event: React.FormEvent) {
    event.preventDefault();
    await runClaimSearch(claimQuery);
  }

  async function requestClaim(productId: string) {
    setClaiming(productId);
    setError("");
    const response = await fetch("/api/dashboard/claims", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId, proof: claimProof[productId] ?? "" }),
    });
    const result = await response.json();
    if (!response.ok) {
      setError(result.error ?? "Could not submit claim.");
    } else {
      setClaimProof((previous) => ({ ...previous, [productId]: "" }));
      await Promise.all([load(), runClaimSearch(claimQuery)]);
    }
    setClaiming(null);
  }

  if (!data) {
    return (
      <main className="flex min-h-[70vh] items-center justify-center px-6 py-12">
        <div className="flex max-w-md flex-col items-center text-center">
          {error ? (
            <>
              <div className="rounded-2xl border border-danger/20 bg-danger/5 p-5 text-sm text-danger">{error}</div>
              <Link href="/auth/sign-in?next=%2Fdashboard" className="mt-4 rounded-xl bg-accent px-5 py-2.5 text-sm font-bold text-accent-ink">Sign in</Link>
            </>
          ) : (
            <>
              <LoaderCircle className="h-7 w-7 animate-spin text-accent" />
              <p className="mt-3 text-sm text-muted">Loading your founder dashboard…</p>
            </>
          )}
        </div>
      </main>
    );
  }

  const totals = data.products.reduce(
    (summary, product) => ({
      votes: summary.votes + product.votesReceived,
      views: summary.views + product.analytics.page_views,
      clicks: summary.clicks + product.analytics.outbound_clicks,
      reviews: summary.reviews + product.reviews,
    }),
    { votes: 0, views: 0, clicks: 0, reviews: 0 },
  );
  const liveProducts = data.products.filter((product) => product.currentMatch);
  const waitingProducts = data.products.filter((product) => !product.currentMatch && product.status === "active");

  return (
    <main className="mx-auto w-full max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <section className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-black tracking-tight text-ink sm:text-3xl">
          Welcome back, {data.founder.name}
        </h1>
        <p className="text-sm text-muted">Here&apos;s what&apos;s happening with your products.</p>
      </section>

      {error && <div className="mt-5 rounded-xl border border-danger/25 bg-danger/5 p-4 text-sm text-danger">{error}</div>}

      <section className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Founder metrics">
        <StatCard icon={Box} tone="emerald" label="My products" value={data.products.length} detail={`${liveProducts.length} live · ${waitingProducts.length} waiting`} />
        <StatCard icon={BarChart3} tone="blue" label="Total votes" value={totals.votes} detail={`${data.products.reduce((sum, product) => sum + product.wins, 0)} duel wins`} />
        <StatCard icon={MousePointer2} tone="violet" label="Website clicks" value={totals.clicks} detail={`${number.format(totals.views)} product views`} />
        <StatCard icon={MessageSquareText} tone="cyan" label="Reviews" value={totals.reviews} detail={`${data.unreadCount} unread notifications`} />
      </section>

      <div className="mt-4 grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_330px]">
        <div className="min-w-0 space-y-4">
          <section id="analytics" className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
              <div>
                <h2 className="font-display text-base font-bold text-ink">Performance overview</h2>
                <p className="mt-0.5 text-xs text-muted">Views, website clicks, and votes across all your products.</p>
              </div>
              <span className="rounded-lg bg-surface-2 px-3 py-1.5 text-xs font-semibold text-muted">Last 30 days</span>
            </div>
            <PerformanceChart data={data.analyticsHistory} totals={totals} />
          </section>

          <section id="products" className="rounded-2xl border border-border bg-surface shadow-sm">
            <SectionHeading title="My products" href="/#submit" linkLabel="Add product" />
            {data.products.length ? (
              <div className="divide-y divide-border">
                {data.products.map((product) => <ProductRow key={product.id} product={product} />)}
              </div>
            ) : (
              <EmptyState icon={Box} title="No products yet" body="Submit your first product to start tracking duels and audience activity." href="/#submit" action="Submit a product" />
            )}
          </section>

          <section className="rounded-2xl border border-border bg-surface shadow-sm">
            <SectionHeading title="Recent activity" href="/dashboard/notifications" linkLabel="View all" />
            {data.activity.length ? (
              <div className="divide-y divide-border">
                {data.activity.slice(0, 6).map((item) => <ActivityRow key={item.id} item={item} />)}
              </div>
            ) : (
              <div className="px-5 py-8 text-center text-sm text-muted">Your Arena activity will appear here.</div>
            )}
          </section>

          <LegacyClaims
            query={claimQuery}
            setQuery={setClaimQuery}
            searching={searchingClaims}
            candidates={claimCandidates}
            proof={claimProof}
            setProof={setClaimProof}
            claiming={claiming}
            onSearch={searchClaims}
            onClaim={requestClaim}
          />

          {data.campaigns.length > 0 && (
            <section className="rounded-2xl border border-border bg-surface shadow-sm">
              <SectionHeading title="Get Listed campaigns" href="/get-listed" linkLabel="View Get Listed" />
              <div className="divide-y divide-border">
                {data.campaigns.map((campaign) => (
                  <Link key={campaign.id} href={`/get-listed/campaigns/${campaign.id}`} className="flex items-center gap-3 px-5 py-4 hover:bg-surface-2">
                    <CheckCircle2 className="h-5 w-5 text-accent" />
                    <span className="min-w-0 flex-1">
                      <strong className="block truncate text-sm text-ink">{campaign.startup_name}</strong>
                      <span className="text-xs capitalize text-muted">{campaign.status.replaceAll("_", " ")} · {campaign.submission_target} listings</span>
                    </span>
                    <ChevronRight className="h-4 w-4 text-muted" />
                  </Link>
                ))}
              </div>
            </section>
          )}
        </div>

        <aside className="space-y-4">
          <section className="rounded-2xl border border-border bg-surface shadow-sm">
            <SectionHeading title="Notifications" href="/dashboard/notifications" linkLabel="View all" />
            {data.activity.length ? (
              <div className="divide-y divide-border">
                {data.activity.slice(0, 5).map((item) => <NotificationRow key={item.id} item={item} />)}
              </div>
            ) : (
              <div className="px-5 py-8 text-center text-sm text-muted">You&apos;re all caught up.</div>
            )}
          </section>

          <section id="duels" className="rounded-2xl border border-border bg-surface shadow-sm">
            <SectionHeading title="Live duels" href="/live-battles" linkLabel="Explore all" />
            <div className="space-y-3 p-4">
              {liveProducts.length ? liveProducts.slice(0, 2).map((product) => <LiveDuelCard key={product.id} product={product} />) : (
                <div className="rounded-xl border border-dashed border-border p-5 text-center">
                  <Swords className="mx-auto h-5 w-5 text-muted" />
                  <p className="mt-2 text-sm font-semibold text-ink">No live duel right now</p>
                  <p className="mt-1 text-xs text-muted">We&apos;ll notify you when a rival is matched.</p>
                </div>
              )}
              {waitingProducts.slice(0, 2).map((product) => (
                <div key={product.id} className="flex items-center gap-3 rounded-xl bg-surface-2 p-3">
                  <ProductAvatar name={product.name} logoUrl={product.logo_url} size="sm" />
                  <span className="min-w-0 flex-1">
                    <strong className="block truncate text-xs text-ink">{product.name}</strong>
                    <span className="text-[11px] text-muted">Waiting for a rival</span>
                  </span>
                  <span className="rounded-full bg-accent/10 px-2 py-1 text-[10px] font-bold text-accent">In queue</span>
                </div>
              ))}
            </div>
          </section>

          <ShareCard product={liveProducts[0] ?? null} />

          <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-400/10 text-amber-500"><Lightbulb className="h-4 w-4" /></span>
              <h2 className="font-display text-sm font-bold text-ink">Founder tip</h2>
            </div>
            <p className="mt-3 text-sm font-semibold text-ink">Share your live duel early.</p>
            <p className="mt-1 text-xs leading-relaxed text-muted">A focused launch-day push gives your community a clear reason to rally around your product.</p>
          </section>
        </aside>
      </div>
    </main>
  );
}

function StatCard({ icon: Icon, tone, label, value, detail }: { icon: typeof Box; tone: "emerald" | "blue" | "violet" | "cyan"; label: string; value: number; detail: string }) {
  const tones = {
    emerald: "bg-emerald-500/10 text-emerald-500",
    blue: "bg-blue-500/10 text-blue-500",
    violet: "bg-violet-500/10 text-violet-500",
    cyan: "bg-cyan-500/10 text-cyan-500",
  };
  return (
    <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
      <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${tones[tone]}`}><Icon className="h-[18px] w-[18px]" /></span>
      <span className="mt-3 block text-xs font-medium text-muted">{label}</span>
      <strong className="mt-0.5 block font-display text-2xl font-black tracking-tight text-ink">{number.format(value)}</strong>
      <span className="mt-1 block text-[11px] font-medium text-muted">{detail}</span>
    </div>
  );
}

function PerformanceChart({ data, totals }: { data: AnalyticsPoint[]; totals: { views: number; clicks: number; votes: number } }) {
  const chart = useMemo(() => {
    const width = 700;
    const left = 46;
    const right = 684;
    const top = 20;
    const bottom = 190;
    const maxValue = Math.max(10, ...data.flatMap((point) => [point.page_views, point.outbound_clicks, point.votes]));
    const x = (index: number) => left + (index / Math.max(1, data.length - 1)) * (right - left);
    const y = (value: number) => bottom - (value / maxValue) * (bottom - top);
    const path = (key: keyof Pick<AnalyticsPoint, "page_views" | "outbound_clicks" | "votes">) => data.map((point, index) => `${index ? "L" : "M"}${x(index).toFixed(1)},${y(point[key]).toFixed(1)}`).join(" ");
    return { width, left, right, top, bottom, maxValue, x, views: path("page_views"), clicks: path("outbound_clicks"), votes: path("votes") };
  }, [data]);

  const labels = data.length ? [0, 9, 19, data.length - 1] : [];
  return (
    <div className="p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap gap-x-5 gap-y-2 text-[11px] text-muted">
        <Legend color="bg-blue-500" label="Product views" value={totals.views} />
        <Legend color="bg-violet-500" label="Website clicks" value={totals.clicks} />
        <Legend color="bg-emerald-500" label="Votes" value={totals.votes} />
      </div>
      <svg viewBox={`0 0 ${chart.width} 225`} className="h-auto min-h-56 w-full overflow-visible" role="img" aria-label="Thirty day performance chart">
        <defs>
          <linearGradient id="dashboard-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 0.25, 0.5, 0.75, 1].map((fraction) => {
          const lineY = chart.bottom - fraction * (chart.bottom - chart.top);
          return (
            <g key={fraction}>
              <line x1={chart.left} x2={chart.right} y1={lineY} y2={lineY} stroke="var(--border)" strokeDasharray="3 5" />
              <text x="38" y={lineY + 4} textAnchor="end" fill="var(--muted)" fontSize="10">{Math.round(chart.maxValue * fraction)}</text>
            </g>
          );
        })}
        {data.length > 0 && <path d={`${chart.views} L${chart.right},${chart.bottom} L${chart.left},${chart.bottom} Z`} fill="url(#dashboard-area)" />}
        <path d={chart.views} fill="none" stroke="#3b82f6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        <path d={chart.clicks} fill="none" stroke="#8b5cf6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        <path d={chart.votes} fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        {labels.map((index) => <text key={index} x={chart.x(index)} y="216" textAnchor="middle" fill="var(--muted)" fontSize="10">{formatChartDay(data[index]?.day)}</text>)}
      </svg>
    </div>
  );
}

function Legend({ color, label, value }: { color: string; label: string; value: number }) {
  return <span className="flex items-center gap-1.5"><span className={`h-2 w-2 rounded-full ${color}`} />{label}<strong className="font-mono text-ink">{number.format(value)}</strong></span>;
}

function SectionHeading({ title, href, linkLabel }: { title: string; href: string; linkLabel: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
      <h2 className="font-display text-base font-bold text-ink">{title}</h2>
      <Link href={href} className="text-xs font-bold text-accent hover:underline">{linkLabel}</Link>
    </div>
  );
}

function ProductRow({ product }: { product: Product }) {
  const match = product.currentMatch;
  const isA = match?.product_a_id === product.id;
  const rival = match ? (isA ? match.product_b : match.product_a) : null;
  const status = match ? "Live duel" : product.status === "champion" ? "Champion" : product.status === "eliminated" ? "Completed" : "Waiting for rival";
  const statusClass = match ? "bg-emerald-500/10 text-emerald-500" : product.status === "champion" ? "bg-amber-400/10 text-amber-500" : "bg-blue-500/10 text-blue-500";
  return (
    <Link href={match ? `/duel/${match.id}` : `/product/${product.id}`} className="grid gap-3 px-4 py-4 transition-colors hover:bg-surface-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-5">
      <div className="flex min-w-0 items-center gap-3">
        <ProductAvatar name={product.name} logoUrl={product.logo_url} size="sm" />
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-2">
            <strong className="truncate text-sm text-ink">{product.name}</strong>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${statusClass}`}>{status}</span>
          </span>
          <span className="mt-1 block truncate text-[11px] text-muted">{match ? `Competing vs. ${rival?.name}` : product.status === "champion" ? `${product.category} champion` : product.category}</span>
        </span>
      </div>
      <div className="grid grid-cols-[repeat(3,minmax(58px,1fr))_20px] items-center gap-2 pl-11 sm:pl-0">
        <MiniMetric icon={Eye} value={product.analytics.page_views} label="Views" />
        <MiniMetric icon={MousePointer2} value={product.analytics.outbound_clicks} label="Clicks" />
        <MiniMetric icon={BarChart3} value={product.votesReceived} label="Votes" />
        <ChevronRight className="h-4 w-4 text-muted" />
      </div>
    </Link>
  );
}

function MiniMetric({ icon: Icon, value, label }: { icon: typeof Eye; value: number; label: string }) {
  return <span className="text-center"><span className="flex items-center justify-center gap-1 font-mono text-xs font-semibold text-ink"><Icon className="h-3 w-3" />{number.format(value)}</span><span className="mt-0.5 block text-[10px] text-muted">{label}</span></span>;
}

function ActivityRow({ item }: { item: ActivityItem }) {
  return (
    <Link href={item.href} className="flex items-center gap-3 px-5 py-3.5 hover:bg-surface-2">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent"><ActivityGlyph type={item.event_type} /></span>
      <span className="min-w-0 flex-1">
        <strong className="block truncate text-xs text-ink">{item.title}</strong>
        <span className="mt-0.5 block truncate text-[11px] text-muted">{item.body}</span>
      </span>
      <time className="shrink-0 text-[10px] text-muted">{timeAgo(item.created_at)}</time>
      {!item.read_at && <span className="h-2 w-2 shrink-0 rounded-full bg-accent" />}
    </Link>
  );
}

function NotificationRow({ item }: { item: ActivityItem }) {
  return (
    <Link href={item.href} className="flex gap-3 px-4 py-3.5 hover:bg-surface-2">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent"><ActivityGlyph type={item.event_type} /></span>
      <span className="min-w-0 flex-1">
        <span className="flex items-start justify-between gap-2"><strong className="line-clamp-2 text-xs text-ink">{item.title}</strong><time className="shrink-0 text-[9px] text-muted">{timeAgo(item.created_at)}</time></span>
        <span className="mt-1 block line-clamp-2 text-[11px] leading-relaxed text-muted">{item.body}</span>
      </span>
    </Link>
  );
}

function LiveDuelCard({ product }: { product: Product }) {
  const match = product.currentMatch!;
  const isA = match.product_a_id === product.id;
  const rival = isA ? match.product_b : match.product_a;
  const myVotes = isA ? match.votes_a : match.votes_b;
  const rivalVotes = isA ? match.votes_b : match.votes_a;
  const progress = Math.min(100, Math.round((myVotes / Math.max(1, myVotes + rivalVotes)) * 100));
  return (
    <div className="rounded-xl border border-border bg-bg p-3.5">
      <div className="flex items-center gap-2">
        <ProductAvatar name={product.name} logoUrl={product.logo_url} size="sm" />
        <span className="min-w-0 flex-1 text-center"><strong className="block truncate text-xs text-ink">{product.name}</strong><span className="text-[10px] font-black text-muted">VS</span><strong className="block truncate text-xs text-ink">{rival.name}</strong></span>
        <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-[10px] font-bold text-emerald-500">Live</span>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full bg-accent" style={{ width: `${progress}%` }} /></div>
      <div className="mt-2 flex justify-between text-[10px] text-muted"><span>{myVotes} votes</span><span>{progress}% share</span></div>
      <Link href={`/duel/${match.id}`} className="mt-3 flex items-center justify-center gap-1 rounded-lg bg-ink px-3 py-2 text-xs font-bold text-bg">View duel <ArrowRight className="h-3 w-3" /></Link>
    </div>
  );
}

function ShareCard({ product }: { product: Product | null }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-blue-400/20 bg-gradient-to-br from-blue-600 via-blue-500 to-violet-600 p-5 text-white shadow-lg">
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15"><Trophy className="h-5 w-5" /></span>
      <h2 className="mt-4 font-display text-lg font-black">Share your duel</h2>
      <p className="mt-1 text-xs leading-relaxed text-blue-50">Bring your audience into the Arena and build momentum for your product.</p>
      <Link href={product?.currentMatch ? `/duel/${product.currentMatch.id}` : "/#submit"} className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-xs font-black text-blue-700 shadow-sm">
        {product ? "Open live duel" : "Submit a product"}<ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </section>
  );
}

function LegacyClaims({ query, setQuery, searching, candidates, proof, setProof, claiming, onSearch, onClaim }: {
  query: string;
  setQuery: (value: string) => void;
  searching: boolean;
  candidates: ClaimCandidate[];
  proof: Record<string, string>;
  setProof: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  claiming: string | null;
  onSearch: (event: React.FormEvent) => Promise<void>;
  onClaim: (productId: string) => Promise<void>;
}) {
  return (
    <details className="group rounded-2xl border border-border bg-surface shadow-sm">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4">
        <span><strong className="font-display text-base text-ink">Claim a legacy product</strong><span className="mt-0.5 block text-xs text-muted">Securely connect a previous Arena submission to your account.</span></span>
        <ChevronRight className="h-4 w-4 text-muted transition-transform group-open:rotate-90" />
      </summary>
      <div className="border-t border-border p-5">
        <form onSubmit={(event) => void onSearch(event)} className="flex flex-col gap-2 sm:flex-row">
          <div className="relative min-w-0 flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" /><input value={query} onChange={(event) => setQuery(event.target.value)} minLength={2} maxLength={80} placeholder="Product name or website" className="w-full rounded-xl border border-border bg-bg py-2.5 pl-10 pr-3 text-sm text-ink outline-none focus:border-accent" /></div>
          <button disabled={searching || query.trim().length < 2} className="rounded-xl bg-accent px-5 py-2.5 text-sm font-bold text-accent-ink disabled:opacity-50">{searching ? "Searching…" : "Search"}</button>
        </form>
        <div className="mt-4 space-y-3">
          {candidates.map((product) => (
            <article key={product.id} className="rounded-xl border border-border bg-bg p-4">
              <div className="flex flex-wrap items-start justify-between gap-3"><span><Link href={`/product/${product.id}`} className="text-sm font-bold text-ink hover:text-accent">{product.name}</Link><span className="mt-1 block text-xs text-muted">{product.url}</span></span><span className="rounded-full bg-surface-2 px-2.5 py-1 text-[10px] font-semibold text-muted">{product.claim ? `Claim ${product.claim.status}` : "Unclaimed"}</span></div>
              {!product.claim && <div className="mt-3 flex flex-col gap-2"><textarea value={proof[product.id] ?? ""} onChange={(event) => setProof((previous) => ({ ...previous, [product.id]: event.target.value }))} rows={2} maxLength={2000} placeholder="Explain how you can verify ownership (10–2,000 characters)." className="rounded-xl border border-border bg-surface p-3 text-sm text-ink outline-none focus:border-accent" /><button disabled={claiming === product.id} onClick={() => void onClaim(product.id)} className="self-start rounded-lg bg-ink px-4 py-2 text-xs font-bold text-bg disabled:opacity-50">{claiming === product.id ? "Submitting…" : "Submit claim for review"}</button></div>}
            </article>
          ))}
        </div>
      </div>
    </details>
  );
}

function EmptyState({ icon: Icon, title, body, href, action }: { icon: typeof Box; title: string; body: string; href: string; action: string }) {
  return <div className="flex flex-col items-center px-5 py-10 text-center"><span className="flex h-11 w-11 items-center justify-center rounded-xl bg-surface-2 text-muted"><Icon className="h-5 w-5" /></span><strong className="mt-3 text-sm text-ink">{title}</strong><p className="mt-1 max-w-sm text-xs text-muted">{body}</p><Link href={href} className="mt-4 rounded-lg bg-accent px-4 py-2 text-xs font-bold text-accent-ink">{action}</Link></div>;
}

function ActivityGlyph({ type }: { type: string }) {
  const className = "h-4 w-4";
  if (type.includes("review")) return <MessageSquareText className={className} />;
  if (type.includes("match") || type.includes("duel")) return <Swords className={className} />;
  if (type.includes("champion") || type.includes("milestone")) return <Trophy className={className} />;
  if (type.includes("waiting") || type.includes("queue")) return <Clock3 className={className} />;
  if (type.includes("announcement")) return <Bell className={className} />;
  return <BarChart3 className={className} />;
}

function timeAgo(value: string) {
  const seconds = Math.max(1, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return "now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatChartDay(value?: string) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
}
