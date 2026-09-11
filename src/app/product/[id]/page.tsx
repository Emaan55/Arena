import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { getProductDetail } from "@/lib/arena-state";
import { BadgeEmbed } from "@/components/BadgeEmbed";
import { ProductAvatar } from "@/components/ProductAvatar";
import { ShareButtons } from "@/components/ShareButtons";
import { WaitingCard } from "@/components/WaitingCard";
import { PayButton } from "@/components/PayButton";
import { ProductLiveDuel } from "@/components/ProductLiveDuel";
import { CrownIcon } from "@/components/icons";
import { XHandleLink } from "@/components/XHandleLink";
import { BattlePitch } from "@/components/BattlePitch";
import { ProductEditor } from "@/components/ProductEditor";
import { timeAgo } from "@/lib/format";
import { STATUS_LABEL, STATUS_CLASS } from "@/lib/product-status";

export const dynamic = "force-dynamic";

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = createAdminSupabaseClient();
  const detail = await getProductDetail(admin, id);
  if (!detail) notFound();

  const { product, champion, history, currentMatch, isWaiting, isUnique } = detail;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const productUrl = `${siteUrl}/product/${product.id}`;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-10 px-6 py-16">
      <Link
        href="/"
        className="flex items-center gap-1.5 text-sm text-muted transition-colors duration-150 ease-out hover:text-accent"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to the Arena
      </Link>

      <div className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <ProductAvatar name={product.name} size="lg" accent={product.status === "champion"} />
            <div className="flex flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-display text-2xl font-bold text-ink sm:text-3xl">{product.name}</h1>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_CLASS[product.status]}`}
                >
                  {STATUS_LABEL[product.status]}
                </span>
              </div>
              <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                {product.category}
              </span>
              <XHandleLink handle={product.x_handle} />
            </div>
          </div>
          <ShareButtons url={productUrl} text={`Check out ${product.name} on The Arena ⚔️`} />
        </div>
        <p className="text-muted">{product.pitch}</p>
        <a
          href={product.url}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="text-sm text-accent hover:underline"
        >
          {product.url}
        </a>
        <BattlePitch
          battlePitch={product.battle_pitch}
          whyUs={product.why_us}
          differentiators={product.differentiators}
        />
      </div>

      <ProductEditor product={product} />

      {currentMatch && (
        <div className="flex flex-col gap-3">
          <h2 className="font-display text-xl font-bold text-ink">Live Duel</h2>
          <ProductLiveDuel match={currentMatch} />
        </div>
      )}

      {isWaiting && (
        <div className="flex flex-col gap-3">
          <h2 className="font-display text-xl font-bold text-ink">Status</h2>
          <WaitingCard product={product} />
        </div>
      )}

      {isUnique && (
        <div className="flex flex-col gap-3">
          <h2 className="font-display text-xl font-bold text-ink">Status</h2>
          <WaitingCard product={product} variant="unique" />
        </div>
      )}

      {product.status === "eliminated" && (
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-5 shadow-sm">
          <p className="text-sm text-muted">
            {product.name} was eliminated. Bring it back into the arena with its win streak
            reset to zero.
          </p>
          <PayButton type="revive" productId={product.id} />
        </div>
      )}

      {champion && (
        <div className="rounded-xl border border-border bg-surface p-5 shadow-sm">
          <div className="flex items-center gap-2 text-sm text-ink">
            <CrownIcon className="h-5 w-5 shrink-0 text-accent" />
            <p>
              Crowned Champion {timeAgo(champion.crowned_at)}
              {champion.times_defended > 0
                ? `, defended the throne ${champion.times_defended}×`
                : ""}
              {product.status !== "champion" ? " (no longer reigning)" : ""}
            </p>
          </div>
          {product.status === "champion" && (
            <>
              <BadgeEmbed badgeUrl={`${siteUrl}/api/badge/${product.id}`} productUrl={productUrl} />
              <div className="mt-4">
                <PayButton type="defend" productId={product.id} />
              </div>
            </>
          )}
        </div>
      )}

      <div className="flex flex-col gap-3">
        <h2 className="font-display text-xl font-bold text-ink">Duel History</h2>
        {history.length === 0 ? (
          <p className="text-sm text-muted">No duels yet.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border rounded-xl border border-border bg-surface shadow-sm">
            {history.map((h, i) => (
              <li key={i} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <span>
                  <span
                    className={`mr-2 rounded-full px-2 py-0.5 font-mono text-xs font-bold ${
                      h.won ? "bg-accent-soft/20 text-accent" : "bg-surface-2 text-muted"
                    }`}
                  >
                    {h.won ? "BEAT" : "LOST TO"}
                  </span>
                  <span className="text-ink">
                    {h.opponentName} [{h.scoreFor}-{h.scoreAgainst}]
                  </span>
                </span>
                <span className="shrink-0 font-mono text-xs text-muted">{timeAgo(h.resolvedAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
