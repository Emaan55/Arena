-- Sponsorship feature: exactly one product can be the "Featured Sponsor" at
-- a time. Anyone else who pays (or is granted a free slot by the founder)
-- is queued and promoted automatically the instant the active slot's
-- `ends_at` passes — no cron, checked lazily on every state fetch, same
-- pattern as the 7-day "unique product" check in 0005. See
-- src/lib/sponsorship.ts (promoteSponsorshipQueue).

create table sponsorships (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products (id) on delete cascade,
  status text not null default 'queued' check (status in ('queued', 'active', 'completed', 'cancelled')),
  duration_days int not null check (duration_days in (7, 14, 30)),
  is_free boolean not null default false,
  amount numeric,
  lemonsqueezy_order_id text,
  position int not null default 0,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now()
);

create index sponsorships_status_idx on sponsorships (status);
create index sponsorships_product_id_idx on sponsorships (product_id);

-- Idempotency against webhook retries — same pattern as `payments`.
create unique index sponsorships_ls_order_id_unique_idx
  on sponsorships (lemonsqueezy_order_id)
  where lemonsqueezy_order_id is not null;

-- Exactly one active sponsorship at a time: every row this partial index
-- covers has the same indexed value ('active'), so a second one would
-- collide on it.
create unique index sponsorships_one_active_idx
  on sponsorships (status)
  where status = 'active';

alter table sponsorships enable row level security;
create policy "public read sponsorships" on sponsorships for select using (true);

-- Widen the payments type check so a paid sponsorship is recorded through
-- the same idempotent payments ledger as boost/revive/defend (see the
-- webhook handler) instead of a separate, untracked path.
alter table payments drop constraint if exists payments_type_check;
alter table payments add constraint payments_type_check
  check (type in ('boost', 'revive', 'defend', 'sponsor'));
