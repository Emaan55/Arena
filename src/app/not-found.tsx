import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex flex-col items-center justify-center gap-4 px-6 py-32 text-center">
      <span className="text-3xl">🔍</span>
      <h1 className="font-display text-2xl font-semibold text-ink">Nothing here</h1>
      <p className="max-w-sm text-sm text-muted">
        This product or page doesn&apos;t exist. Maybe it was never submitted, or the
        link is off.
      </p>
      <Link
        href="/"
        className="rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-accent-ink shadow-sm transition-all duration-150 ease-out hover:-translate-y-0.5 hover:shadow-md active:scale-95"
      >
        Back to the Arena
      </Link>
    </main>
  );
}
