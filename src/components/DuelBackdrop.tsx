/**
 * Faint atmosphere behind the live-duel cards: a diagonal line grid plus
 * two soft accent glows, theme-aware via the `--duel-grid-line`/
 * `--duel-glow-*` variables in globals.css (same light/dark cascade as the
 * hero backdrop). Purely decorative — never competes with the cards
 * sitting on top of it.
 */
export function DuelBackdrop() {
  return (
    <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden rounded-3xl" aria-hidden="true">
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            "repeating-linear-gradient(115deg, var(--duel-grid-line) 0, var(--duel-grid-line) 1px, transparent 1px, transparent 64px), repeating-linear-gradient(25deg, var(--duel-grid-line) 0, var(--duel-grid-line) 1px, transparent 1px, transparent 64px)",
        }}
      />
      <div
        className="absolute -left-20 -top-20 h-72 w-72 rounded-full blur-3xl"
        style={{ background: "var(--duel-glow-1)" }}
      />
      <div
        className="absolute -bottom-20 -right-20 h-72 w-72 rounded-full blur-3xl"
        style={{ background: "var(--duel-glow-2)" }}
      />
    </div>
  );
}
