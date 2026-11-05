import Link from "next/link";
import { Swords } from "lucide-react";
import type { Product } from "@/types/database";
import { WaitingCard } from "./WaitingCard";

export function WaitingProducts({ products }: { products: Product[] }) {
  return <section id="waiting" aria-labelledby="waiting-heading" className="scroll-mt-20 border-t border-border px-3 py-8 sm:px-6 sm:py-10">
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <header className="flex max-w-2xl flex-col gap-3">
        <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-accent"><Swords className="h-4 w-4" />Find your next rival</span>
        <h2 id="waiting-heading" className="font-display text-2xl font-black leading-tight text-ink sm:text-3xl">These Startups Are Waiting for a Challenger <span aria-hidden="true">⚔️</span></h2>
        <p className="text-sm leading-relaxed text-muted">They&apos;ve entered The Arena. Now they need a rival. Think your product can beat one of them?</p>
      </header>
      {products.length ? <div className="grid gap-4 md:grid-cols-2">
        {products.map((product) => <WaitingCard key={product.id} product={product} featured />)}
      </div> : <div className="flex flex-col items-start gap-4 rounded-2xl border border-dashed border-accent/30 bg-accent/5 p-5 sm:p-6">
        <div className="flex flex-col gap-1"><h3 className="font-display font-bold text-ink">No startups are waiting right now.</h3><p className="text-sm text-muted">Enter your product and give the next challenger a rival to face.</p></div>
        <Link href="/submit" className="inline-flex min-h-11 items-center justify-center rounded-lg bg-accent px-4 text-sm font-bold text-accent-ink">Submit Product</Link>
      </div>}
    </div>
  </section>;
}
