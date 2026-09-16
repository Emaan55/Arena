-- Favicon discovery gets real status tracking instead of a bare nullable
-- URL, so "never tried yet", "resolved successfully", and "failed (retry
-- later)" are distinguishable — and so a genuine failure is never
-- permanently cached: see backfillMissingProductFavicons in lib/arena.ts.
alter table products add column logo_status text not null default 'pending'
  check (logo_status in ('pending', 'success', 'temporary_failure', 'not_found'));
alter table products add column logo_checked_at timestamptz;
alter table products add column logo_next_attempt_at timestamptz not null default now();
alter table products add column logo_attempts int not null default 0;
-- Which discovery strategy actually succeeded (e.g. "link[rel=icon]") —
-- diagnostic only, shown in the admin favicon-diagnostic tool.
alter table products add column logo_source text;

create index products_logo_retry_idx on products (logo_next_attempt_at) where logo_status != 'success';

-- One-time reclassification of existing rows. Products already carrying a
-- URL from OUR OWN storage (the new pipeline) are already good. Everything
-- else — including rows still holding the old third-party favicon-guess
-- URL from before this fix — never actually went through real discovery,
-- so it's queued for an immediate retry under the new multi-strategy
-- pipeline. This is what actually fixes already-submitted products like
-- thearena.lol and goatboard.lol; the existing (possibly wrong) logo_url
-- is left in place until a real attempt replaces it, so nothing regresses
-- to a blank icon in the meantime.
update products
set logo_status = 'success', logo_checked_at = now()
where logo_url is not null and logo_url not like '%google.com/s2/favicons%';

update products
set logo_status = 'pending', logo_next_attempt_at = now()
where logo_url is null or logo_url like '%google.com/s2/favicons%';
