/**
 * "As featured on" badges as a continuous, seamless-loop marquee. Pure CSS
 * (the @keyframes lives in globals.css) — no JS, no client component, no
 * carousel library. The badge list is rendered twice back to back and the
 * whole track shifts left by 50% of its own width per loop; see the
 * `marquee` keyframe's comment for why spacing has to come from a margin
 * on each badge rather than a flex `gap`.
 *
 * Every href/src/alt/rel/width/height below is exactly what was pasted in
 * when each badge was added — this only changes how they're laid out and
 * displayed (size, grayscale-until-hover), never the link or image itself.
 */
interface FeaturedBadge {
  href: string;
  rel: string;
  src: string;
  alt: string;
  width: number;
  height?: number;
  lazy?: boolean;
  ariaLabel?: string;
}

const FEATURED_BADGES: FeaturedBadge[] = [
  {
    href: "https://www.scrolllaunch.com/products/the-arena?ref=badge",
    rel: "noopener",
    src: "https://www.scrolllaunch.com/api/badge/the-arena",
    alt: "Featured on ScrollLaunch",
    width: 220,
    height: 48,
    lazy: true,
  },
  {
    href: "https://nicklaunches.com/",
    rel: "noopener",
    src: "https://nicklaunches.com/badges/featured.png",
    alt: "Featured on Nick Launches",
    width: 244,
    height: 56,
    lazy: true,
  },
  {
    href: "https://www.betterlaunch.co/product/the-arena",
    rel: "nofollow noopener",
    src: "https://www.betterlaunch.co/badge-week-light.svg",
    alt: "Product of the week on Better Launch",
    width: 176,
    height: 48,
    lazy: true,
  },
  {
    href: "https://www.foundrlist.com/product/thearena?utm_source=badge&utm_medium=embed",
    rel: "noopener",
    src: "https://www.foundrlist.com/api/badge/thearena",
    alt: "Featured on FoundrList",
    width: 150,
    height: 48,
    lazy: true,
  },
  {
    href: "https://daniellaunches.com",
    rel: "noopener",
    src: "https://daniellaunches.com/badge-light.svg",
    alt: "Featured on DanielLaunches",
    width: 220,
    height: 48,
    lazy: true,
  },
  {
    href: "https://www.aidirectori.es/ai-tools/the-arena",
    rel: "noopener noreferrer",
    src: "https://cdn.aidirectori.es/ai-tools/badges/light-mode.png",
    alt: "AI Directories Badge",
    width: 220,
    height: 48,
    lazy: true,
  },
  {
    href: "https://verifieddr.com/website/thearena-lol",
    rel: "noopener",
    src: "https://verifieddr.com/badge/thearena-lol.svg?metric=truedr",
    alt: "Verified DR - Verified Domain Rating for thearena.lol",
    width: 220,
    height: 68,
    lazy: true,
  },
  {
    href: "https://neeed.directory",
    rel: "noopener",
    src: "https://neeed.directory/badges/neeed-badge-light.svg",
    alt: "Featured on neeed.directory",
    width: 139,
  },
  {
    href: "https://tools.launchllama.co/products/the-arena?utm_source=badge&utm_medium=referral",
    rel: "noopener noreferrer",
    src: "https://tools.launchllama.co/featured-badge.png?v=2",
    alt: "Featured on Launch Llama Tools",
    width: 200,
    height: 52,
    lazy: true,
  },
  {
    href: "https://mydentify.com/",
    rel: "noopener",
    src: "https://mydentify.com/badges/listed-on-mydentify.svg",
    alt: "Listed on Mydentify",
    ariaLabel: "Listed on Mydentify",
    width: 176,
    height: 32,
  },
  {
    href: "https://aihuntlist.com/tool/the-arena",
    rel: "noopener noreferrer",
    src: "https://aihuntlist.com/badge-light.svg",
    alt: "Featured on aihuntlist.com",
    width: 200,
    height: 54,
  },
  {
    href: "https://vibecodinglist.com/projects/the-arena-where-products-compete?utm_source=vcl_badge&utm_medium=builder_site&utm_campaign=listed_badge&utm_content=the-arena-where-products-compete",
    rel: "noopener",
    src: "https://vibecodinglist.com/assets/embed-widget/featured-on-badge-light.png",
    alt: "Featured on VibeCodingList",
    width: 200,
    height: 51,
    lazy: true,
  },
];

function BadgeLink({ badge, duplicate = false }: { badge: FeaturedBadge; duplicate?: boolean }) {
  return (
    <a
      href={badge.href}
      target="_blank"
      rel={badge.rel}
      aria-label={badge.ariaLabel}
      aria-hidden={duplicate || undefined}
      tabIndex={duplicate ? -1 : undefined}
      className={`mr-10 flex shrink-0 items-center ${duplicate ? "motion-reduce:hidden" : ""}`}
    >
      <img
        src={badge.src}
        alt={badge.alt}
        width={badge.width}
        height={badge.height}
        loading={badge.lazy ? "lazy" : undefined}
        className="h-9 w-auto object-contain opacity-80 grayscale transition-all duration-200 ease-out hover:opacity-100 hover:grayscale-0"
      />
    </a>
  );
}

export function FeaturedMarquee() {
  return (
    <div className="border-t border-border">
      <div className="mx-auto flex max-w-7xl items-center gap-4 px-6 py-5 md:px-10">
        <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-muted">As featured on</span>
        <div
          className="group relative min-w-0 flex-1 overflow-hidden motion-reduce:overflow-x-auto"
          style={{
            maskImage: "linear-gradient(to right, transparent, black 12%, black 88%, transparent)",
            WebkitMaskImage: "linear-gradient(to right, transparent, black 12%, black 88%, transparent)",
          }}
        >
          <div className="flex w-max items-center [animation:marquee_45s_linear_infinite] group-hover:[animation-play-state:paused] motion-reduce:[animation:none]">
            {FEATURED_BADGES.map((badge) => (
              <BadgeLink key={badge.href} badge={badge} />
            ))}
            {FEATURED_BADGES.map((badge) => (
              <BadgeLink key={`${badge.href}-duplicate`} badge={badge} duplicate />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
