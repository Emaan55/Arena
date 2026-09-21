/**
 * Get Listed hero artwork — swapped between /listingheroright.png (light)
 * and /listingherodarkright.png (dark) via the `--get-listed-hero-image`
 * CSS variable in globals.css, the exact same light/dark/manual-override
 * cascade as the brand logo and the homepage's ArenaBackdrop — no JS, so
 * it can never flash the wrong asset.
 *
 * Rendered as a cover-fit background-image inside an overflow-hidden box
 * rather than a plain <img>, with a gradient overlay that fades the top,
 * left, and bottom edges into `var(--bg)`. Each source file was matted
 * for its own theme's page background, but object-fit/contain still left
 * a visible rectangle wherever the container's aspect ratio didn't
 * exactly match the artwork's — this fades that seam into the actual
 * page background instead, so the artwork reads as part of the hero
 * rather than an image pasted beside the text. The right edge is left
 * un-faded since it only ever meets the section/viewport edge, not a
 * competing background.
 *
 * background-position is biased slightly left-of-center (not full
 * left/right) so cover-fit crops only the artwork's own empty margins —
 * never the floating directory icons, the laptop/dashboard, THE ARENA
 * mark, or the "GET LISTED" badge, all of which sit in the middle-to-right
 * two-thirds of the source image.
 */
export function GetListedHeroArt() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <div
        className="absolute inset-0 bg-cover"
        style={{
          backgroundImage: "var(--get-listed-hero-image)",
          backgroundPosition: "38% center",
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(115deg, var(--bg) 0%, transparent 22%), linear-gradient(to bottom, var(--bg) 0%, transparent 14%, transparent 86%, var(--bg) 100%)",
        }}
      />
    </div>
  );
}
