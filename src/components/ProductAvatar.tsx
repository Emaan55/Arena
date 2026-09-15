// No uploaded logos in the data model — a deterministic initial avatar
// keeps every product visually identifiable without inventing fake assets.
export function ProductAvatar({
  name,
  size = "md",
  accent = false,
  glow = false,
}: {
  name: string;
  size?: "sm" | "md" | "lg" | "xl";
  accent?: boolean;
  /** Adds the same accent glow used for a voted duel card / #1 leaderboard row. */
  glow?: boolean;
}) {
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  const sizeClass = {
    sm: "h-8 w-8 text-sm",
    md: "h-11 w-11 text-base",
    lg: "h-14 w-14 text-xl",
    xl: "h-24 w-24 text-4xl sm:h-28 sm:w-28",
  }[size];

  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-lg border font-display font-bold ${sizeClass} ${
        accent
          ? "border-accent/40 bg-accent-soft/15 text-accent"
          : "border-border bg-surface-2 text-ink"
      }`}
      style={glow ? { boxShadow: "var(--glow-accent)" } : undefined}
      aria-hidden="true"
    >
      {initial}
    </div>
  );
}
