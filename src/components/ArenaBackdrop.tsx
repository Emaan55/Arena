/**
 * Hero background photo — swapped between a bright daylight stadium (light
 * mode) and a moody dual-spotlight arena (dark mode) via the
 * `--backdrop-image`/`--backdrop-opacity` CSS variables in globals.css,
 * using the exact same light/dark/manual-override cascade as the brand
 * logo (BrandLogo.tsx) — no JS, so it can never flash the wrong image.
 *
 * A gradient overlay fades the photo into the page background at the top
 * and bottom so it reads as an atmospheric backdrop behind the hero copy,
 * never a competing, hard-edged rectangle.
 */
export function ArenaBackdrop() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{
          backgroundImage: "var(--backdrop-image)",
          opacity: "var(--backdrop-opacity)",
          animation: "backdrop-pan 24s ease-in-out infinite alternate",
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(to bottom, var(--bg) 0%, transparent 22%, transparent 68%, var(--bg) 100%)",
        }}
      />
    </div>
  );
}
