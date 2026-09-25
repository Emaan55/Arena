import { CheckCircle2, Clock, XCircle, ExternalLink, ShieldCheck } from "lucide-react";
import type { CustomerCampaignReport } from "@/lib/get-listed/report";
import type { CampaignStatus } from "@/types/database";

const STATUS_BANNER: Record<CampaignStatus, { title: string; body: string }> = {
  draft: { title: "Draft", body: "This campaign hasn't been submitted for fulfillment yet." },
  awaiting_payment: { title: "Awaiting payment", body: "Payment is required before fulfillment can begin." },
  active: { title: "Active", body: "Your campaign is active and submissions are underway." },
  in_progress: { title: "In progress", body: "Your product is being submitted to directories." },
  completed: { title: "Completed", body: "Your submission target has been completed." },
  cancelled: { title: "Cancelled", body: "This campaign has been cancelled." },
};

const STATUS_STYLE: Record<CampaignStatus, string> = {
  draft: "bg-surface-2 text-muted",
  awaiting_payment: "bg-surface-2 text-muted",
  active: "bg-accent-soft/20 text-accent",
  in_progress: "bg-accent-soft/20 text-accent",
  completed: "bg-[#16a34a]/10 text-[#16a34a]",
  cancelled: "bg-danger/10 text-danger",
};

const PAYMENT_LABEL: Record<CustomerCampaignReport["payment"]["status"], string> = {
  no_order: "Not started",
  pending: "Pending",
  paid: "Paid",
  failed: "Failed",
  refunded: "Refunded",
  cancelled: "Cancelled",
};

const DISCLOSURES = [
  "We submit to third-party directories on your behalf.",
  "Acceptance is not guaranteed; each directory decides independently.",
  "The number sold is a submission target, not a guarantee of live listings.",
  "We don't control third-party review times or policies.",
  "Refunds are handled under the refund policy.",
];

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

/**
 * The one report UI both the customer page (get-listed/campaigns/[id])
 * and the admin preview (admin/get-listed/campaigns/[id]/report) render —
 * purely presentational, fed by CustomerCampaignReport from
 * lib/get-listed/report.ts. Never fetches its own data, so there is no
 * way for the two callers' reports to say different things.
 */
export function CampaignReport({ report }: { report: CustomerCampaignReport }) {
  const { campaign, payment, progress, accepted, pending, rejected, timeline } = report;
  const banner = STATUS_BANNER[campaign.status];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-bold text-ink">{campaign.startupName}</h1>
            <p className="text-sm text-muted">
              Get Listed, {campaign.packageLabel} Package: {campaign.submissionTarget} directory submissions
            </p>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${STATUS_STYLE[campaign.status]}`}>{banner.title}</span>
        </div>
        <p className="text-sm text-ink">{banner.body}</p>
        <div className="grid grid-cols-2 gap-4 border-t border-border pt-4 text-sm sm:grid-cols-3">
          <div>
            <span className="block text-xs uppercase tracking-wide text-muted">Campaign started</span>
            <span className="text-ink">{formatDate(campaign.createdAt)}</span>
          </div>
          <div>
            <span className="block text-xs uppercase tracking-wide text-muted">Website</span>
            <a href={campaign.websiteUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-accent hover:underline">
              Visit <ExternalLink className="h-3 w-3" />
            </a>
          </div>
          <div>
            <span className="block text-xs uppercase tracking-wide text-muted">Package</span>
            <span className="text-ink">
              {campaign.packageLabel}
              {payment.amountCents !== null && ` ($${(payment.amountCents / 100).toFixed(2)})`}
            </span>
          </div>
          <div>
            <span className="block text-xs uppercase tracking-wide text-muted">Payment</span>
            <span className="text-ink">{PAYMENT_LABEL[payment.status]}</span>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-6 shadow-sm">
        <h2 className="font-display text-lg font-bold text-ink">Submission progress</h2>
        {progress.target > 0 ? (
          <>
            <div className="flex items-baseline gap-2">
              <span className="font-display text-3xl font-black text-ink">
                {progress.submitted} / {progress.target}
              </span>
              {progress.progressPercent !== null && <span className="text-sm text-muted">{progress.progressPercent}% complete</span>}
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full rounded-full bg-accent transition-all"
                style={{ width: `${Math.min(100, progress.progressPercent ?? 0)}%` }}
              />
            </div>
            <p className="text-sm text-muted">
              {progress.remaining > 0
                ? `${progress.remaining} submission${progress.remaining === 1 ? "" : "s"} remaining`
                : "Submission target reached."}
            </p>
          </>
        ) : (
          <p className="text-sm text-muted">Submission target unavailable for this campaign.</p>
        )}

        <div className="grid grid-cols-2 gap-3 border-t border-border pt-4 text-center text-xs sm:grid-cols-4">
          <div className="rounded-lg bg-surface-2 py-2">
            <span className="block font-display text-lg font-bold text-ink">{progress.submitted}</span>
            Submitted
          </div>
          <div className="rounded-lg bg-surface-2 py-2">
            <span className="block font-display text-lg font-bold text-[#16a34a]">{progress.accepted}</span>
            Accepted
          </div>
          <div className="rounded-lg bg-surface-2 py-2">
            <span className="block font-display text-lg font-bold text-muted">{progress.pending}</span>
            Pending
          </div>
          <div className="rounded-lg bg-surface-2 py-2">
            <span className="block font-display text-lg font-bold text-danger">{progress.rejected}</span>
            Rejected
          </div>
        </div>
        <p className="text-xs text-muted">
          Acceptance rate:{" "}
          <span className="font-semibold text-ink">
            {progress.acceptanceRate !== null ? `${progress.acceptanceRate}%` : "Not enough completed responses yet"}
          </span>
        </p>
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-6 shadow-sm">
        <h2 className="flex items-center gap-2 font-display text-lg font-bold text-ink">
          <CheckCircle2 className="h-4 w-4 text-[#16a34a]" />
          Live / accepted listings
        </h2>
        {accepted.length === 0 ? (
          <p className="text-sm text-muted">No listings have been accepted yet. Your submissions are still being reviewed.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {accepted.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface-2 px-4 py-3 text-sm">
                <span className="font-semibold text-ink">{s.directoryName}</span>
                {s.listingUrl ? (
                  <a href={s.listingUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-accent hover:underline">
                    View listing <ExternalLink className="h-3 w-3" />
                  </a>
                ) : (
                  <span className="text-xs text-muted">Listing URL pending</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {pending.length > 0 && (
        <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-6 shadow-sm">
          <h2 className="flex items-center gap-2 font-display text-lg font-bold text-ink">
            <Clock className="h-4 w-4 text-muted" />
            Waiting for directory response
          </h2>
          <ul className="flex flex-col gap-2">
            {pending.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-2 rounded-lg bg-surface-2 px-4 py-3 text-sm">
                <span className="font-semibold text-ink">{s.directoryName}</span>
                <span className="text-xs text-muted">Reviewing</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {rejected.length > 0 && (
        <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-6 shadow-sm">
          <h2 className="flex items-center gap-2 font-display text-lg font-bold text-ink">
            <XCircle className="h-4 w-4 text-danger" />
            Not accepted
          </h2>
          <ul className="flex flex-col gap-2">
            {rejected.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-2 rounded-lg bg-surface-2 px-4 py-3 text-sm">
                <span className="font-semibold text-ink">{s.directoryName}</span>
                <span className="text-xs text-danger">Rejected</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {progress.submitted === 0 && (
        <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted">
          Your campaign is ready. Submissions will appear here once fulfillment begins.
        </p>
      )}

      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-6 shadow-sm">
        <h2 className="font-display text-lg font-bold text-ink">Activity</h2>
        {timeline.length === 0 ? (
          <p className="text-sm text-muted">No activity yet.</p>
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {timeline.map((entry) => (
              <li key={entry.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2 last:border-0 last:pb-0">
                <span className="text-ink">{entry.label}</span>
                <span className="text-xs text-muted">{formatDate(entry.date)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex items-start gap-3 rounded-xl border border-border bg-surface-2 p-4">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
        <ul className="flex flex-col gap-1 text-xs text-muted">
          {DISCLOSURES.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
