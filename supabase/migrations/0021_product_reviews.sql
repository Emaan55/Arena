-- Optional post-vote reviews: right after casting a vote, a voter may
-- (never required) write a short note on why they picked that side. Tied
-- to the specific vote (match_id + user_id) rather than the product alone,
-- so it can never be submitted for the opponent's product or duplicated
-- for the same vote — the unique constraint below is the hard backstop,
-- and the API route independently re-verifies the vote itself before ever
-- inserting a row. Additive only, no existing table or column touched.
create table product_reviews (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches (id) on delete cascade,
  product_id uuid not null references products (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  unique (match_id, user_id)
);

-- Used both to render "N reviews" per product and to list them on request.
create index product_reviews_product_id_idx on product_reviews (product_id, created_at desc);

-- Same zero-policy RLS posture as every other mutable table in this app
-- (see migration 0001 and 0015's comments) — reachable only through the
-- service-role admin client from server-side route handlers.
alter table product_reviews enable row level security;
