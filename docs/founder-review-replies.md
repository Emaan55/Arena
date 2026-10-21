# Founder replies to product reviews

## Enable in Supabase (free plan supported)

1. Open the Arena project's **SQL Editor**, then **New query**.
2. Paste the complete contents of `supabase/migrations/0030_product_review_replies.sql` and run it once. It requires the existing product-review and founder-notification migrations (0021 and 0025).
3. Confirm `public.product_review_replies` exists and RLS is enabled. The migration creates public read and verified-owner insert/update/delete policies.
4. If the API still reports temporary unavailability after the migration, run `NOTIFY pgrst, 'reload schema';` and reload the page.

No new environment variables, paid Supabase plan, email provider configuration, or scheduled jobs are required. Before the migration, existing reviews continue working and reply actions stay hidden.

## Authorization and behavior

- Only `products.owner_id` establishes verified ownership. Email addresses, social handles, browser edit tokens, and pending legacy claims do not authorize replies.
- Legacy founders must complete the existing admin-approved product claim process.
- API writes use the authenticated Supabase client. RLS checks the review's actual product, current owner, and reply author independently of the API check.
- Each review has at most one reply. Replies have no parent-reply field and cannot form nested threads.
- Reply content is plain text, trimmed and limited to 10–2000 Unicode characters. Edit/delete requires both current product ownership and authorship of the reply.
- Public responses contain display name, avatar, content, and dates; they do not expose reviewer emails, raw Auth metadata, or reply author IDs.
- On first publication, the existing notification table receives one in-app notification for the reviewer. Self-notifications and deleted accounts are skipped. The review-based event key prevents duplicates, including delete/repost cycles. Edits do not notify again.
- Existing settings keep in-app notifications enabled and control optional emails separately. Reply events request no emails.
- Notification links include the relevant duel and review identifier. Live review lists open the targeted review, including reviews older than the normal 50-row list.

## Checks

```text
node --test tests/founder-replies.test.mjs tests/product-internal-links.test.mjs tests/post-vote-review-flow.test.mjs tests/reviewer-profile.test.mjs
node node_modules/typescript/bin/tsc --noEmit
npm run lint
npm run build
```

The standalone database test installs no application dependency. With a separate temporary installation of `@electric-sql/pglite`, run:

```text
node tests/founder-replies-db.mjs <temporary-install>/node_modules/@electric-sql/pglite/dist/index.js
```

It applies the migration to a disposable PostgreSQL database and tests RLS, authorization, duplicate replies, notification recipients/idempotency, transaction rollback, legacy claim approval, and unchanged reviews/votes. It never connects to production.

## Changed files

| Area | Files |
| --- | --- |
| Review UI | `src/components/FounderReviewReply.tsx`, `src/components/MatchCard.tsx` |
| Existing authenticated viewer context | `src/components/ArenaApp.tsx`, `src/components/ProductLiveDuel.tsx` |
| API | `src/app/api/reviews/route.ts`, `src/app/api/reviews/[reviewId]/reply/route.ts` |
| Validation and types | `src/lib/founder-reply.ts`, `src/lib/reviewer-profile.ts`, `src/types/database.ts` |
| Client documentation comment only | `src/lib/supabase/server.ts` |
| Database | `supabase/migrations/0030_product_review_replies.sql` |
| Tests | `tests/founder-replies.test.mjs`, `tests/founder-replies-db.mjs`, `tests/product-internal-links.test.mjs` |
| Setup guide | `docs/founder-review-replies.md` |
