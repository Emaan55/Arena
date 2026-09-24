"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { useAuthUser } from "@/lib/useAuthUser";
import type { Campaign, CampaignStatus, Order, Submission, SubmissionStatus } from "@/types/database";
import { GET_LISTED_PACKAGES } from "@/lib/get-listed/packages";

const STATUS_LABEL: Record<CampaignStatus, string> = {
  draft: "Draft",
  awaiting_payment: "Awaiting payment",
  active: "Active",
  in_progress: "In progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

const SUB_STATUS_STYLE: Record<SubmissionStatus, string> = {
  pending: "bg-surface-2 text-muted",
  submitted: "bg-accent-soft/20 text-accent",
  accepted: "bg-[#16a34a]/10 text-[#16a34a]",
  rejected: "bg-danger/10 text-danger",
};

// Polls while a payment could still be in flight — a webhook usually lands
// within a few seconds, but this never assumes success on its own; only a
// campaign.status flip (driven solely by the verified webhook or an admin
// reconciliation) ever changes what's shown.
const POLL_MS = 4000;

export default function CampaignDetailPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const { user, loading: authLoading } = useAuthUser();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [submissions, setSubmissions] = useState<Submission[] | null>(null);
  const [order, setOrder] = useState<Order | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);

  const justReturnedFromCheckout = searchParams.get("checkout") === "return";

  function load() {
    return fetch(`/api/get-listed/campaigns/${params.id}`)
      .then(async (res) => {
        if (!res.ok) {
          setNotFound(true);
          return;
        }
        const data = await res.json();
        setCampaign(data.campaign);
        setSubmissions(data.submissions ?? []);
        setOrder(data.order ?? null);
      })
      .catch(() => setNotFound(true));
  }

  useEffect(() => {
    if (authLoading || !user) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id, user, authLoading]);

  // While the campaign is still awaiting payment, keep checking for the
  // webhook to land instead of requiring a manual refresh.
  useEffect(() => {
    if (authLoading || !user || !campaign) return;
    if (campaign.status !== "awaiting_payment") return;
    const interval = setInterval(load, POLL_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaign?.status, authLoading, user]);

  async function startCheckout() {
    setPayError(null);
    setPaying(true);
    try {
      const res = await fetch("/api/get-listed/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId: params.id }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) {
        setPayError(data.error ?? "Could not start checkout.");
        return;
      }
      if (window.LemonSqueezy?.Url) {
        window.LemonSqueezy.Setup?.({
          eventHandler: (event) => {
            if (event.event === "Checkout.Success") {
              setTimeout(load, 1500);
            }
          },
        });
        window.LemonSqueezy.Url.Open(data.url);
      } else {
        window.open(data.url, "_blank", "noopener,noreferrer");
      }
    } catch {
      setPayError("Network error, please try again.");
    } finally {
      setPaying(false);
    }
  }

  if (!authLoading && !user) {
    return (
      <main className="mx-auto flex w-full max-w-2xl flex-col items-center gap-4 px-6 py-24 text-center">
        <p className="text-sm text-muted">Sign in to view this campaign.</p>
        <Link
          href={`/auth/sign-in?next=${encodeURIComponent(`/get-listed/campaigns/${params.id}`)}`}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink shadow-sm"
        >
          Sign in
        </Link>
      </main>
    );
  }

  if (notFound) {
    return (
      <main className="mx-auto flex w-full max-w-2xl flex-col items-center gap-4 px-6 py-24 text-center">
        <p className="text-sm text-muted">Campaign not found.</p>
        <Link href="/get-listed/campaigns" className="text-sm text-accent hover:underline">
          Back to your campaigns
        </Link>
      </main>
    );
  }

  if (!campaign || !submissions) {
    return (
      <main className="mx-auto flex w-full max-w-2xl px-6 py-24 text-center text-sm text-muted">Loading…</main>
    );
  }

  const submitted = submissions.filter((s) => s.status === "submitted").length;
  const accepted = submissions.filter((s) => s.status === "accepted").length;
  const rejected = submissions.filter((s) => s.status === "rejected").length;
  const pending = submissions.filter((s) => s.status === "pending").length;
  const pkg = GET_LISTED_PACKAGES[campaign.package_key as keyof typeof GET_LISTED_PACKAGES];
  const pct = Math.min(100, Math.round((submissions.length / campaign.submission_target) * 100));

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 py-16">
      <Link
        href="/get-listed/campaigns"
        className="flex items-center gap-1.5 text-sm text-muted transition-colors duration-150 ease-out hover:text-accent"
      >
        <ArrowLeft className="h-4 w-4" />
        Your campaigns
      </Link>

      <div className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-display text-2xl font-bold text-ink">{campaign.startup_name}</h1>
          <span className="rounded-full bg-surface-2 px-3 py-1 text-xs font-semibold text-muted">
            {STATUS_LABEL[campaign.status]}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
          <div>
            <span className="block text-xs uppercase tracking-wide text-muted">Package</span>
            <span className="font-semibold text-ink">{pkg?.label ?? campaign.package_key}</span>
          </div>
          <div>
            <span className="block text-xs uppercase tracking-wide text-muted">Price</span>
            <span className="font-semibold text-ink">
              {order ? (
                <>
                  ${(order.final_amount / 100).toFixed(2)}
                  {order.discount_percent > 0 && (
                    <span className="ml-1 text-xs font-normal text-muted line-through">${pkg?.priceUsd}</span>
                  )}
                </>
              ) : (
                `$${pkg?.priceUsd ?? "-"}`
              )}
            </span>
          </div>
          <div>
            <span className="block text-xs uppercase tracking-wide text-muted">Progress</span>
            <span className="font-semibold text-ink">
              {submissions.length} / {campaign.submission_target}
            </span>
          </div>
          <div>
            <span className="block text-xs uppercase tracking-wide text-muted">Website</span>
            <a
              href={campaign.website_url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 font-semibold text-accent hover:underline"
            >
              Visit <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2">
          <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${pct}%` }} />
        </div>
        <div className="grid grid-cols-4 gap-3 text-center text-xs">
          <div className="rounded-lg bg-surface-2 py-2">
            <span className="block font-display text-lg font-bold text-ink">{submitted}</span>
            Submitted
          </div>
          <div className="rounded-lg bg-surface-2 py-2">
            <span className="block font-display text-lg font-bold text-[#16a34a]">{accepted}</span>
            Accepted
          </div>
          <div className="rounded-lg bg-surface-2 py-2">
            <span className="block font-display text-lg font-bold text-muted">{pending}</span>
            Pending
          </div>
          <div className="rounded-lg bg-surface-2 py-2">
            <span className="block font-display text-lg font-bold text-danger">{rejected}</span>
            Rejected
          </div>
        </div>
      </div>

      {justReturnedFromCheckout && campaign.status === "active" && (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-accent bg-accent-soft/10 p-6 text-center shadow-sm">
          <h2 className="font-display text-lg font-black uppercase text-ink">Payment confirmed</h2>
          <p className="text-sm text-muted">Your Get Listed campaign is active.</p>
        </div>
      )}

      {campaign.status === "awaiting_payment" && (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-surface p-6 text-center shadow-sm">
          {order && order.payment_status === "pending" ? (
            <>
              <h2 className="font-display text-lg font-bold text-ink">Payment processing…</h2>
              <p className="max-w-md text-sm text-muted">
                {justReturnedFromCheckout
                  ? "We're confirming your payment with LemonSqueezy. This page will update automatically, no need to refresh."
                  : "A checkout is already in progress for this campaign. If you completed payment, this page will update automatically."}
              </p>
            </>
          ) : (
            <>
              <h2 className="font-display text-lg font-bold text-ink">Complete your payment to activate this campaign</h2>
              <p className="max-w-md text-sm text-muted">
                Your campaign is created but won&apos;t start until payment is confirmed.
              </p>
            </>
          )}
          {payError && <p className="text-sm text-danger">{payError}</p>}
          <button
            onClick={startCheckout}
            disabled={paying}
            className="rounded-lg bg-accent px-6 py-2.5 text-sm font-semibold text-accent-ink shadow-sm transition-all duration-150 ease-out hover:-translate-y-0.5 hover:shadow-md active:scale-95 disabled:pointer-events-none disabled:opacity-50"
          >
            {paying
              ? "Starting checkout…"
              : order
                ? "Retry payment"
                : `Pay $${((pkg?.priceUsd ?? 0) * (1 - (campaign.discount_percent ?? 0) / 100)).toFixed(2)}`}
          </button>
        </div>
      )}

      <div className="flex flex-col gap-3">
        <h2 className="font-display text-lg font-bold text-ink">Submissions</h2>
        {submissions.length === 0 ? (
          <p className="rounded-xl border border-border bg-surface p-6 text-center text-sm text-muted">
            No submissions recorded yet. Your report will update as our team works through your campaign.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface-2 text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-2">Directory</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2">Listing</th>
                  <th className="px-4 py-2">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-surface">
                {submissions.map((s) => (
                  <tr key={s.id}>
                    <td className="px-4 py-2">
                      {s.directory_url ? (
                        <a href={s.directory_url} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                          {s.directory_name}
                        </a>
                      ) : (
                        s.directory_name
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${SUB_STATUS_STYLE[s.status]}`}>
                        {s.status}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      {s.listing_url ? (
                        <a href={s.listing_url} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                          View
                        </a>
                      ) : (
                        <span className="text-muted">-</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-muted">{s.notes || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
