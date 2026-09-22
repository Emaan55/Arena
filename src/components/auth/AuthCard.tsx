import Link from "next/link";
import { BrandLogo } from "@/components/BrandLogo";

/** Shared shell for every /auth/* page — matches the reference mockup's card layout, corner accents, and footer lockup. */
export function AuthCard({
  topRight,
  children,
}: {
  topRight?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <main className="relative flex min-h-[85vh] items-center justify-center overflow-hidden px-6 py-16">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute -top-10 right-10 h-24 w-24 rotate-45 border-t border-r border-accent/20" />
        <div className="absolute -bottom-10 left-10 h-24 w-24 rotate-45 border-b border-l border-accent/20" />
      </div>

      <div className="relative w-full max-w-md rounded-2xl border border-border bg-surface p-8 shadow-lg">
        <div className="flex items-center justify-between gap-3">
          <Link href="/" className="flex items-center gap-2 font-display text-sm font-bold text-ink">
            <BrandLogo variant="icon" className="h-6 w-6" />
            THE ARENA
          </Link>
          {topRight}
        </div>

        <div className="mt-6 flex flex-col gap-6">{children}</div>

        <div className="mt-8 flex items-center justify-center gap-2 border-t border-border pt-4">
          <BrandLogo variant="icon" className="h-3.5 w-3.5 opacity-60" />
          <span className="text-xs text-muted">THE ARENA</span>
        </div>
      </div>
    </main>
  );
}
