-- Products get the same auto-resolved-favicon treatment sponsorships
-- already have (see 0008/lib/url-metadata.ts) — no manual logo upload,
-- reuses the exact same resolveFaviconUrl() function. Resolved at
-- submission for new products; existing ones are lazily backfilled a few
-- at a time (see backfillMissingProductFavicons in lib/arena.ts, called
-- from GET /api/state) so it never blocks a page load.
alter table products add column logo_url text;
