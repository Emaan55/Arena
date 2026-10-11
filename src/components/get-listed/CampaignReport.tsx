import { CheckCircle2, Circle, Clock, ExternalLink, FileText, ShieldCheck, XCircle } from "lucide-react";
import type { CustomerCampaignReport } from "@/lib/get-listed/report";
import type { CampaignStatus } from "@/types/database";

const STATUS_BANNER: Record<CampaignStatus, { title: string; body: string }> = {
  draft: { title: "Draft", body: "This campaign hasn't been submitted for fulfillment yet." },
  awaiting_payment: { title: "Awaiting payment", body: "Payment is required before fulfillment can begin." },
  active: { title: "Active", body: "Your promotion campaign is active and ready for fulfillment." },
  in_progress: { title: "In progress", body: "Your campaign deliverables are being created and published." },
  completed: { title: "Completed", body: "Your campaign has been marked complete and the available results are recorded below." },
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
  "Promotional work increases opportunities for discovery but does not guarantee traffic, customers, signups, sales, or rankings.",
  "Acceptance is not guaranteed; each directory decides independently.",
  "Sponsored content is disclosed where required and third-party content can be moderated or removed.",
  "Available engagement metrics depend on what each publishing platform reports.",
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
  const { campaign, payment, progress, accepted, pending, rejected, deliverables, timeline } = report;
  const banner = STATUS_BANNER[campaign.status];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-bold text-ink">{campaign.startupName}</h1>
            <p className="text-sm text-muted">
              {campaign.packageLabel}{campaign.durationDays ? ` · ${campaign.durationDays}-day campaign` : ` · ${campaign.submissionTarget} directory submissions`}
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

      {deliverables.length > 0 && (
        <div className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-6 shadow-sm">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="font-display text-lg font-bold text-ink">Campaign deliverables</h2>
              <p className="mt-1 text-sm text-muted">Updates reflect work recorded by The Arena fulfillment team.</p>
            </div>
            <span className="text-xs font-semibold text-muted">
              {deliverables.filter((item) => item.status === "completed").length} / {deliverables.filter((item) => item.status !== "not_applicable").length} completed
            </span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {deliverables.map((item) => (
              <article key={item.id} className="rounded-xl border border-border bg-bg p-4">
                <div className="flex items-start gap-3">
                  {item.status === "completed" ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[#16a34a]" /> : item.status === "in_progress" ? <Clock className="mt-0.5 h-5 w-5 shrink-0 text-accent" /> : <Circle className="mt-0.5 h-5 w-5 shrink-0 text-muted" />}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-sm font-bold text-ink">{item.title}</h3>
                      <span className="text-[11px] font-semibold capitalize text-muted">{item.status.replace("_", " ")}</span>
                    </div>
                    <p className="mt-1 text-xs leading-5 text-muted">{item.purpose}</p>
                    {item.customer_notes && <p className="mt-2 rounded-lg bg-surface-2 p-2 text-xs text-ink">{item.customer_notes}</p>}
                    <div className="mt-2 flex flex-wrap gap-3 text-xs font-semibold text-accent">
                      {item.public_url && <a href={item.public_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:underline">View published work <ExternalLink className="h-3 w-3" /></a>}
                      {item.asset_url && <a href={item.asset_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:underline">Open asset <FileText className="h-3 w-3" /></a>}
                    </div>
                    {Object.keys(item.metrics ?? {}).length > 0 && <div className="mt-3 flex flex-wrap gap-2">{Object.entries(item.metrics).map(([label, value]) => <span key={label} className="rounded-full bg-surface-2 px-2.5 py-1 text-[11px] text-muted"><strong className="text-ink">{value}</strong> {label.replaceAll("_", " ")}</span>)}</div>}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      )}

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

