# Homepage discovery and authenticated submission

## Behavior

- The homepage renders one waiting-products section immediately after its existing hero (including How The Arena Works). The submission form is on `/submit`.
- Waiting cards reuse the existing state response and card component. Only active, unmatched products with a valid pool-entry time less than seven days old are included. No additional database queries were introduced.
- Cards link to the product profile and to `/submit?category=...`. Category intent is allowlisted server-side; clicking a challenge never creates or reserves a duel. Existing category queue and pairing rules remain authoritative.
- Guests visiting `/submit` go to signup. Existing users can choose Sign in. Signup, confirmation, recovery from an expired confirmation link, and login retain the validated same-site destination. Accounts that already receive a session at signup can continue immediately.
- The submission page verifies the user with Supabase Auth on the server. A proxy restricted to `/submit` persists refreshed session cookies and prevents public response caching. The form also handles a session ending while it is open.
- New paid submissions require authentication before checkout. Their owner comes from the verified session. The existing fixed $1 variant, earned-free eligibility, submission validator, duplicate protection, and payment-confirmed webhook creation remain in place.
- Navbar, footer, dashboard and hero submission links use `/submit`. Old homepage `#submit` bookmarks redirect there.
- The navbar Sign In link also retains validated submission intent on signup and verification pages, including category selection.
- The route is excluded from indexing and robots crawling. No database migration, dependency, environment variable, payment-provider or Supabase configuration change is required.

## Changed files

New implementation:

- `src/app/submit/page.tsx`
- `src/components/SubmissionExperience.tsx`
- `src/components/WaitingProducts.tsx`
- `src/lib/submission-path.ts`
- `src/lib/waiting-products.ts`
- `src/proxy.ts`

Existing implementation updated:

- `src/components/ArenaApp.tsx`
- `src/components/WaitingCard.tsx`
- `src/components/SubmitForm.tsx`
- `src/components/SiteHeader.tsx`
- `src/components/SiteFooter.tsx`
- `src/components/dashboard/DashboardShell.tsx`
- `src/app/dashboard/page.tsx`
- `src/lib/arena-state.ts`
- `src/lib/arena.ts` (shared seven-day constant only)
- `src/lib/auth/config.ts`
- `src/lib/supabase/server.ts`
- `src/app/api/submit/checkout/route.ts`
- `src/app/api/auth/sign-up/route.ts`
- `src/app/auth/sign-up/page.tsx`
- `src/app/auth/confirm/route.ts`
- `src/app/robots.ts`

Verification: `tests/submission-experience.test.mjs` (18 focused tests), this report.

## Verification

- TypeScript: passed.
- ESLint: passed with two existing warnings (`ArenaApp` hook dependency and `FeaturedMarquee` image).
- Production build: passed, including the dynamic submission route and scoped proxy.
- Regression tests: 72 passed using the regular Node test environment, plus 18 passed using `--conditions=react-server` for the two server-only suites (90 total).
- Local browser fixture used real page/form/auth UI with simulated sessions, email confirmation and backend responses. Verified guest challenge to signup, existing-user login, confirmation continuation, authenticated refresh, category selection, optional fields and earned-free submission success.
- Browser layout checks at 320, 375, 390, 430, 768 and 1280 pixels: no horizontal overflow in the waiting section; homepage submission form absent. Light/dark modes and the small-mobile form were inspected.

No real accounts, submissions, payments or emails were created by these checks. Production email delivery and a real charged checkout remain manual end-to-end checks. There is no existing dedicated waiting-only Explore route, so no misleading View All filter link was added; all eligible waiting products appear in the section.
