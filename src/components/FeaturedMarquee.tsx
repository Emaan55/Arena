"use client";

import { useCallback, useState } from "react";

/** Provider links and image URLs stay in the initial server-rendered HTML.
 * Image failures get a readable linked label without changing the source.
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
  // Passthrough for a badge provider's own verification data attribute on
  // the <img> (e.g. KittyLaunch's data-kittylaunch-badge), kept verbatim.
  imgDataAttr?: { name: string; value: string };
}

// Keep the supplied verification badge visible and outside the animated,
// duplicated track. Its image remains a direct child of the provider link.
const VERIFICATION_BADGE: FeaturedBadge = {
  href: "https://aixcollection.com/ai/thearena",
  rel: "noopener",
  src: "https://aixcollection.com/assets/images/badge.png",
  alt: "AI X Collection",
  width: 213,
  height: 54,
  lazy: true,
};

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
    height: 44,
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
  {
    href: "https://aitoolfame.com/item/the-arena",
    rel: "noopener noreferrer",
    src: "https://aitoolfame.com/badge-light.svg",
    alt: "Featured on aitoolfame.com",
    width: 190,
    height: 54,
  },
  {
    href: "https://startupbenchmarks.com/product/thearena",
    rel: "noopener",
    src: "https://startupbenchmarks.com/assets/images/badge.png",
    alt: "Startup Benchmarks",
    width: 265,
    height: 54,
    lazy: true,
  },
  {
    href: "https://saasavenue.com/products/thearena",
    rel: "noopener",
    src: "https://saasavenue.com/assets/images/badge.png",
    alt: "SaaS Avenue",
    width: 199,
    height: 54,
    lazy: true,
  },
  {
    href: "https://udonboost.com/",
    rel: "noopener noreferrer",
    src: "https://udonboost.com/badges/featured-partner.svg",
    alt: "UdonBoost Featured Partner",
    width: 183,
    height: 54,
  },
  {
    href: "https://noonlaunch.com/product/the-arena",
    rel: "dofollow",
    src: "https://noonlaunch.com/badges/the-arena.svg",
    alt: "Featured on Noonlaunch",
    width: 220,
    height: 60,
  },
  {
    href: "https://kittylaunch.com/p/the-arena?utm_source=badge",
    rel: "noopener",
    src: "https://kittylaunch.com/api/public/badges/launch_badge.svg?style=pill&theme=light",
    alt: "The Arena — Verified by KittyLaunch",
    width: 296,
    height: 76,
    imgDataAttr: { name: "data-kittylaunch-badge", value: "1" },
  },
];

function BadgeLink({ badge, duplicate = false, pinned = false }: {
  badge: FeaturedBadge;
  duplicate?: boolean;
  pinned?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const imageRef = useCallback((image: HTMLImageElement | null) => {
    // The browser may finish loading an SSR image before React attaches
    // onError. Check it when the element mounts as well as on load/error.
    if (image?.complete) setFailed(image.naturalWidth === 0);
  }, []);
  const displayHeight = 54;
  const displayWidth = Math.round(badge.width * displayHeight / (badge.height ?? displayHeight));

  return (
    <a
      href={badge.href}
      target="_blank"
      rel={badge.rel}
      aria-label={badge.ariaLabel ?? badge.alt}
      aria-hidden={duplicate || undefined}
      tabIndex={duplicate ? -1 : undefined}
      className={`relative flex shrink-0 items-center justify-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${pinned ? "" : "mr-10"} ${duplicate ? "motion-reduce:hidden" : ""}`}
      style={{ width: displayWidth, height: displayHeight }}
    >
      <img
        ref={imageRef}
        src={badge.src}
        alt={badge.alt}
        width={badge.width}
        height={badge.height}
        loading={badge.lazy ? "lazy" : undefined}
        onError={() => setFailed(true)}
        onLoad={() => setFailed(false)}
        className={`h-full w-full object-contain transition-opacity duration-200 ease-out ${failed ? "invisible" : "opacity-100 hover:opacity-80"}`}
        {...(badge.imgDataAttr ? { [badge.imgDataAttr.name]: badge.imgDataAttr.value } : {})}
      />
      {failed && (
        <span
          aria-hidden="true"
          className="absolute inset-0 flex items-center justify-center rounded-lg border border-border bg-surface px-3 text-xs font-semibold text-ink"
        >
          <span className="truncate">{badge.alt}</span>
        </span>
      )}
    </a>
  );
}

export function FeaturedMarquee() {
  return (
    <div className="border-t border-border">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-6 py-5 md:px-10 lg:flex-row lg:items-center">
        <div className="flex flex-wrap items-center gap-4">
          <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-muted">As featured on</span>
          <BadgeLink badge={VERIFICATION_BADGE} pinned />
        </div>
        <div
          className="group relative min-w-0 w-full flex-1 overflow-hidden motion-reduce:overflow-x-auto"
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
