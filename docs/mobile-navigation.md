# Mobile navigation fix — 2026-10-30

## Production follow-up — 2026-11-01

The October 30 implementation was local only. GitHub `main` was still at `60d951d` when the blank mobile drawer was reported again, so the production deployment still contained the original clipped drawer. This change publishes the existing navigation fix together with the following mobile duel adjustments.

- `src/components/MatchCard.tsx`: keep both opponents side by side below 640px, with compact padding, avatars, typography and a smaller VS divider. Preserve profile/outbound links, vote counts and existing voting/payment callbacks. Mobile battle pitches and boost details expand on demand; their complete copy, pricing and checkout controls remain available. Product reviews and founder replies use the shared full-width mobile dialog rather than squeezing into a half-width card. Desktop review presentation is unchanged.
- `src/components/ArenaApp.tsx`: reclaim redundant mobile-only padding around the live duel list; the existing spacing returns at `sm`.
- `tests/product-internal-links.test.mjs`: supply the shared overlay dependency to the existing isolated card tests.

The November 1 browser checks passed all 40 size/orientation/theme/auth-state combinations below, also using long product names and selected-vote states. Both cards shared the same top edge, neither card overflowed, all 10 menu links remained reachable, and scroll locking/dismissal worked. Expandable pitches, boost pricing/disclaimers, full-width reviews/replies, and local vote-state transitions were checked separately. No production votes or payments were submitted. Desktop card, profile-link and button geometry at 1280px matched the original component exactly. TypeScript, production build and 20 targeted tests passed; lint has the same two existing warnings.

## Confirmed causes

- The sticky header has `backdrop-filter: blur(24px)`. This establishes a containing block for its fixed descendants. The old drawer used `top: 64px; bottom: 0` inside a 64px header, leaving only 32px of padding visible around 553px of content in the browser reproduction.
- The notification panel was anchored to the bell, before the avatar, rather than to the full header on mobile. At a 390px viewport its left edge was approximately -44px.
- The account menu had no viewport height limit, so its lower controls could extend past short landscape screens.

## Changes

- `src/components/MobileOverlay.tsx`: shared mobile-only portal to `document.body`, dynamic viewport height, modal semantics, focus containment/restoration, Escape, scroll locking/restoration, scrollbar compensation, and automatic dismissal at the relevant desktop breakpoint.
- `src/components/SiteHeader.tsx`: full-height mobile drawer with its own close button, safe-area padding, a shrinking scroll region, backdrop dismissal, existing links, and 44px touch targets. Narrow-screen spacing accommodates the larger controls.
- `src/components/ProductSearch.tsx`: reuse the overlay for the existing mobile search, with safe-area padding and scroll/focus management. Search data and navigation logic remain the same.
- `src/components/NotificationCenter.tsx`: anchor the mobile panel to the header, bound its width/height, keep its footer available while its list scrolls, and enlarge mobile touch targets.
- `src/components/UserProfileMenu.tsx`: constrain mobile account dropdown height and enlarge touch targets.
- `src/components/ThemeToggle.tsx`: opt-in mobile touch target used by the site header; other instances retain their sizing.
- `tests/mobile-navigation.test.mjs`: dependency-free lifecycle tests for the actual overlay component.

No database migrations, environment variables, dependencies, or paid services are needed.

## Verification

Browser tests used the actual navbar/search/notification/profile components with the production build's CSS. Local fixture boundaries supplied guest/founder auth state and notification/search responses; they made no changes to production accounts or data.

| Portrait | Landscape | States | Themes | Result |
| --- | --- | --- | --- | --- |
| 320 × 568 | 568 × 320 | Guest, founder | Light, dark | 8 passed |
| 375 × 667 | 667 × 375 | Guest, founder | Light, dark | 8 passed |
| 390 × 844 | 844 × 390 | Guest, founder | Light, dark | 8 passed |
| 430 × 932 | 932 × 430 | Guest, founder | Light, dark | 8 passed |
| 768 × 1024 | 1024 × 768 | Guest, founder | Light, dark | 8 passed |

Each combination checked header fit, visible control sizing, all 10 drawer links, last-link reachability, internal scrolling, focus wrap, Escape, focus restoration, scroll unlocking, and the bounds of notification/account panels when authenticated.

Additional interaction checks cover close-button/backdrop/link dismissal, scroll preservation, desktop-breakpoint cleanup, mobile search results and keyboard controls. Desktop header geometry at 1440 × 900 matched the original exactly after existing transitions settled. The public production homepage at 320px had no document-level horizontal overflow; outlying decorative shapes were already clipped by their containers.

Commands:

```sh
node node_modules/typescript/bin/tsc --noEmit
npm run lint
npm run build
node --test tests/mobile-navigation.test.mjs tests/product-internal-links.test.mjs tests/founder-replies.test.mjs
```

The 20 targeted/regression tests and production build passed. Lint has two pre-existing warnings in `ArenaApp.tsx` and `FeaturedMarquee.tsx`, with no errors. The local build also reports the existing missing `FINGERPRINT_SIGNING_SECRET` warning; this task does not alter configuration.

## Remaining device checks

Viewport tests do not emulate a physical iPhone/Android browser's collapsing toolbars, on-screen keyboard or nonzero notch insets. Check the published build on those devices, including rotating while the drawer is open and opening/closing search with the keyboard visible. Real authenticated Supabase sessions were not exercised in the local fixture; authentication code was unchanged.
