"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex flex-col items-center justify-center gap-4 px-6 py-32 text-center">
      <span className="text-3xl">⚔️</span>
      <h1 className="font-display text-2xl font-semibold text-ink">
        Something went wrong in the arena
      </h1>
      <p className="max-w-sm text-sm text-muted">
        That&apos;s on us, not you. Try again in a moment. If it keeps happening, the
        underlying service may be temporarily unavailable.
      </p>
      <button
        onClick={reset}
        className="rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-accent-ink shadow-sm transition-all duration-150 ease-out hover:-translate-y-0.5 hover:shadow-md active:scale-95"
      >
        Try again
      </button>
    </main>
  );
}
