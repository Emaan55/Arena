-- Phase 2 "Discount Drop" — an optional reaction game that can unlock a
-- Get Listed discount. Schema matches the fields specified for the
-- feature; the server-authoritative challenge schedule and RNG seed used
-- to validate a completed attempt live inside `metadata` (jsonb) rather
-- than as new top-level columns.

create table game_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  score int,
  discount_percent int,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  duration_ms int,
  validation_status text not null default 'pending'
    check (validation_status in ('pending', 'valid', 'suspicious', 'rejected')),
  metadata jsonb not null default '{}'::jsonb
);

create index game_attempts_user_id_idx on game_attempts (user_id);

create table discount_awards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  campaign_id uuid references campaigns (id) on delete set null,
  game_attempt_id uuid not null references game_attempts (id) on delete cascade,
  score int not null,
  discount_percent int not null check (discount_percent between 0 and 60),
  status text not null default 'available'
    check (status in ('available', 'redeemed', 'expired', 'cancelled')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  redeemed_at timestamptz
);

create index discount_awards_user_id_idx on discount_awards (user_id);
create index discount_awards_status_idx on discount_awards (status);

-- Lets a campaign remember which discount (if any) it was created with —
-- checked server-side in POST /api/get-listed/campaigns (ownership +
-- available + not-expired, exactly like a vote's server-side checks),
-- so an expired/foreign/already-used award can never be attached. Actual
-- payment-time enforcement (marking the award "redeemed") is a LemonSqueezy-
-- phase concern, deliberately not built here.
alter table campaigns add column discount_award_id uuid references discount_awards (id) on delete set null;
alter table campaigns add column discount_percent int check (discount_percent between 0 and 60);

-- Same zero-policy RLS posture as every other mutable table in this app
-- (votes, payments, campaigns/submissions — see migration 0001 and 0015's
-- comments): reachable only through the service-role admin client from
-- server-side route handlers, which independently verify identity before
-- every read or write.
alter table game_attempts enable row level security;
alter table discount_awards enable row level security;
