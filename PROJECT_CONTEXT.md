# The Arena: project context

Reviewed 2026-10-09. Navigation memory only; source, SQL migrations, and current task requirements are authoritative.

## Product and stack

Product discovery/battle platform: same-category product duels; authenticated visitors vote; first to 100 wins; three consecutive duel wins crown a champion. Additional features: paid product/sponsor actions, product reviews, the Arena review wall, and paid Get Listed campaigns.

- Next.js App Router 16.3.2, React 19.2.8, TypeScript 5, Tailwind 4; Supabase Postgres/Auth/Storage; Lemon Squeezy; `sharp` for image processing.
- Strict TS; `@/*` -> `src/*`. Scripts: dev/build/start/lint. One test file: `tests/arena-review-validation.test.mjs`; tests were not run.
- Root had no `node_modules` during review. `AGENTS.md` requires reading relevant docs from `node_modules/next/dist/docs/` before source edits. README’s “Next 14+” is stale; package is Next 16.3.2. `next dev` regenerates the AGENTS.md block.

## Structure

- `src/app`: public pages, auth pages, admin pages, API route handlers. Pages include home, product, live battles, reviews, Get Listed/campaigns/Discount Drop, privacy/terms, and admin tools.
- `src/components`: homepage/game UI, auth, product editing, reviews, payments, branding and shared layout pieces.
- `src/lib`: arena state/rules, Supabase clients, auth, validation, payments, sponsorship, favicon service, reviews, Get Listed and Discount Drop.
- `src/types/database.ts`: app types and Supabase schema/RPC types.
- `supabase/migrations/0001`–`0024`: authoritative schema and atomic database functions; schema has evolved beyond README’s early setup description.
- `public`: logos, theme-specific backdrops, favicons, OG image, plus starter SVGs.

## Runtime architecture and security

Homepage (`src/app/page.tsx`) is dynamic, reads service-role Supabase data, loads `getArenaState()` and review teaser, then renders interactive `ArenaApp`. `ArenaApp` polls `/api/state` every 5 seconds. That GET also lazily marks stale waiting products unique and backfills a small batch of due favicons, so it is mutating work.

Supabase clients: `lib/supabase/client.ts` browser anon/session; `server.ts` cookie-aware anon client for server-verified `auth.getUser()`; `admin.ts` server-only service role, bypasses RLS, used for writes. Never expose service-role key or trust client-supplied user IDs. `.env.local.example` lists Supabase, Lemon Squeezy variants, ADMIN_SECRET, fingerprint secrets, and public site URL.

Payments start via checkout routes but effects only happen after raw-body HMAC verification and paid webhook. Payment/order IDs provide idempotency. Get Listed uses a separate orders table and atomic `finalize_get_listed_order()` because payment, activation, and award redemption are one transaction. Optional-migration readiness checks deliberately protect paid flows and cosmetic additions when a deployment is partially migrated.

## Arena invariants

Categories: General, AI Tools, Dev Tools, Design, Marketing, Productivity, Other. Product states: active/eliminated/champion/unique; match states: active/resolved.

`lib/arena.ts`: `pairUnmatchedProducts()` pairs oldest unmatched active/unique products within category. `resolveMatchIfComplete()` conditionally resolves at 100 votes; only `applyWin()` increments wins. Loser is eliminated/streak reset. Three wins crowns/defends champion. A live vote lead or waiting never earns wins. Lone products become `unique` after 7 days, lazily (no cron), remain challengeable, and are excluded from wins leaderboard.

`POST /api/votes` requires signed-in Supabase identity, rate limits IP/account, checks duel-spray abuse, then calls `cast_vote_authenticated` RPC; DB uniqueness enforces one vote/account/duel. Legacy anonymous fingerprints/RPC remain for historical rows, not current writes. Product POST requires auth and earned free eligibility (5 distinct duels voted + 2 reviews) via atomic claim RPC; paid $1 and admin submission paths also use `createArenaProduct()`. Submission defenses include validation/duplicate URL, honeypot/fill time, rate limits. Edit token plaintext is shown once, only hash stored; edits close after 24h.

## Other domains

- Sponsorships feature either an Arena product or external listing (not added as Arena product); one active slot, queue promotion lazy on state fetch. Logic in `lib/sponsorship.ts`.
- Get Listed is distinct from Arena products. Packages source of truth `lib/get-listed/packages.ts`: Starter $60/30 submissions, Growth $120/60, Scale $180/120; server computes cents from package key and verified award, never client price. Campaigns include submissions, directory library, CSV/bulk imports, reporting/export, audit, soft delete/restore, analytics, reconciliation.
- Discount Drop: 45s reaction game; server schedule and score validation are authoritative. Up to 60% discount. One free try; replay requires 5 distinct duels since last completion plus 24h cooldown. Awards expire in 2 min unless claimed, then 30 min.
- `/reviews` Arena wall (`arena_reviews`) is distinct from `product_reviews`. Signed-in, one review/account; chosen public display name; optional social profile and photo. `sharp` validates/re-encodes uploads <=2MB/16MP to 256px WebP stripping metadata; storage bucket `arena-review-avatars`; Unavatar lookup is optional/unverified.
- Auth supports email/password, terms acceptance, confirmation, recovery/reset; vote intent resumes via `resumeVote` query.

## UI and future-work notes

Theme is CSS-variable-driven, persisted as `arena_theme`; inline root script sets it before paint and syncs favicons. Main styles `src/app/globals.css`; review styles in component and app review CSS. Home is section/anchor based. Key home components: `ArenaApp`, `MatchCard`, `WaitingCard`, `HallOfFame`, `Leaderboard`, `WinStreakLeaderboard`, `SponsoredSection`, `ActivityFeed`.

At review time git status was clean; latest commits were visual fixes/reviewer profiles. No tests were run. Before code changes, read the relevant installed Next docs. For DB changes add migrations after 0024, update TS types and migration-readiness guards where relevant. Review fallback/partial-migration behavior before simplifying it.


## Founder analytics and notification implementation (2026-10-09)

The founder feature set is implemented on top of Supabase Auth and the existing products/matches/votes/product_reviews/Get Listed tables; it does not replace voting, pairing, payment, or review logic. Apply `supabase/migrations/0025_founder_analytics_notifications.sql` after 0024. It adds nullable `products.owner_id`, analytics aggregates/short-retention event identifiers, preferences, notifications/outbox, admin announcements, and pending ownership claims. Public product column grants and app serializers hide both owner IDs and `edit_token_hash`.

- Product detail page views POST to `/api/analytics`; outbound links redirect through `/api/products/[id]/outbound`. A first-party HttpOnly browser UUID plus daily HMAC hash powers approximate unique visitor/day counts. Deterministic HMAC event IDs collapse rapid duplicate page views (10m) and clicks (30s). No IP is written to analytics tables; existing in-memory rate limits still process IP transiently.
- Notification rows are created by Postgres triggers/RPCs in the same transaction as product submission, match activation, vote milestones, duel results, champion status, reviews, Get Listed status, claim decisions, and announcement publication. `(user_id,event_key)` is unique. `after()` wakes Resend delivery, the outbox tracks attempts/backoff/locks, and the protected `/api/cron/founder-notifications` route creates daily digests, weekly waiting reminders, prunes analytics IDs, and recovers jobs.
- Founder surfaces: `/dashboard`, `/dashboard/notifications`, `/dashboard/settings`, navbar bell, `/duel/[id]`; authenticated owner filtering is server-side. Legacy product claims are searched from `/dashboard`, remain pending until `/admin/founder-claims` approves via atomic RPC. `/admin/announcements` uses existing `ADMIN_SECRET`; publish is one-way/idempotent and only emails subscribers.
- Email uses Resend REST (no new dependency). Configure `RESEND_API_KEY`, verified `ARENA_EMAIL_FROM`, optional `ARENA_EMAIL_REPLY_TO`, random `NOTIFICATION_UNSUBSCRIBE_SECRET`, and `CRON_SECRET`; keep `FINGERPRINT_SIGNING_SECRET` configured too. `vercel.json` runs every 5 minutes, which requires Vercel Pro/Enterprise; Hobby cron is daily and hour-window approximate. Resend idempotency keys are retained for 24h. New settings and limitations are in README and `.env.local.example`.
- Verification on 2026-10-09: Next 16.3.2 production build succeeded, `npx tsc --noEmit` succeeded, `npm run lint` had zero errors (two existing warnings in ArenaApp and FeaturedMarquee), and 15 tests passed (`tests/founder-activity-notifications.test.mjs` plus existing review tests). No live Supabase migration or Resend/Vercel delivery could be exercised without project credentials; static migration-contract tests are not a substitute for live trigger/RLS tests.
