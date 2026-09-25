"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useAuthUser } from "@/lib/useAuthUser";
import { CampaignReport } from "@/components/get-listed/CampaignReport";
import type { CustomerCampaignReport } from "@/lib/get-listed/report";

// Polls while a payment could still be in flight — a webhook usually lands
// within a few seconds, but this never assumes success on its own; only a
// campaign.status flip (driven solely by the verified webhook or an admin
// reconciliation) ever changes what's shown.
const POLL_MS = 4000;

export default function CampaignDetailPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const { user, loading: authLoading } = useAuthUser();
  const [report, setReport] = useState<CustomerCampaignReport | null>(null);
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
        setReport(data.report);
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
    if (authLoading || !user || !report) return;
    if (report.campaign.status !== "awaiting_payment") return;
    const interval = setInterval(load, POLL_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report?.campaign.status, authLoading, user]);

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

  if (!report) {
    return <main className="mx-auto flex w-full max-w-2xl px-6 py-24 text-center text-sm text-muted">Loading…</main>;
  }

  const { campaign, payment } = report;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 py-16">
      <Link
        href="/get-listed/campaigns"
        className="flex items-center gap-1.5 text-sm text-muted transition-colors duration-150 ease-out hover:text-accent"
      >
        <ArrowLeft className="h-4 w-4" />
        Your campaigns
      </Link>

      {justReturnedFromCheckout && campaign.status === "active" && (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-accent bg-accent-soft/10 p-6 text-center shadow-sm">
          <h2 className="font-display text-lg font-black uppercase text-ink">Payment confirmed</h2>
          <p className="text-sm text-muted">Your Get Listed campaign is active.</p>
        </div>
      )}

      {campaign.status === "awaiting_payment" && (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-surface p-6 text-center shadow-sm">
          {payment.status === "pending" ? (
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
              : payment.status !== "no_order"
                ? "Retry payment"
                : `Pay $${((campaign.packagePriceUsd ?? 0) * (1 - (campaign.discountPercent ?? 0) / 100)).toFixed(2)}`}
          </button>
        </div>
      )}

      <CampaignReport report={report} />
    </main>
  );
}
