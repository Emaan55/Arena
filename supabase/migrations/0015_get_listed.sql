-- Phase 1 "Get Listed": manual directory-submission campaigns. A separate
-- feature from the duel/voting system — no existing table is touched.
--
-- Package pricing/target (starter=30/$60, growth=60/$120, scale=120/$180)
-- is NOT stored here — it lives in src/lib/get-listed/packages.ts as the
-- single server-side source of truth, exactly like BOOST_VOTES/VOTES_TO_WIN
-- in lib/arena.ts. package_key on a campaign is just a label; every route
-- handler re-resolves the actual target/price from that config, never from
-- anything the client sends and never by re-reading a stored price.

create table campaigns (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  startup_name text not null,
  website_url text not null,
  description text not null,
  category text not null,
  x_url text,
  linkedin_url text,
  other_url text,
  package_key text not null check (package_key in ('starter', 'growth', 'scale')),
  submission_target int not null check (submission_target > 0),
  status text not null default 'draft'
    check (status in ('draft', 'awaiting_payment', 'active', 'in_progress', 'completed', 'cancelled')),
  terms_accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index campaigns_owner_id_idx on campaigns (owner_id);
create index campaigns_status_idx on campaigns (status);

-- One row = one real, manually-performed directory submission. Never
-- auto-generate submission_target placeholder rows — progress is always
-- COUNT(*) of real rows here against campaigns.submission_target, computed
-- fresh on every read, never a stored/editable counter (see
-- getCampaignProgress in lib/get-listed/campaigns.ts).
create table submissions (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns (id) on delete cascade,
  directory_name text not null,
  directory_url text,
  status text not null default 'pending' check (status in ('pending', 'submitted', 'accepted', 'rejected')),
  listing_url text,
  notes text,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index submissions_campaign_id_idx on submissions (campaign_id);

-- ---------------------------------------------------------------------------
-- Row Level Security
--
-- Same posture as every other mutable table in this app (votes, payments —
-- see migration 0001's comment): zero policies for the anon/authenticated
-- roles, so campaigns/submissions are reachable ONLY through the
-- service-role admin client from server-side route handlers. A signed-in
-- customer's own Supabase session can never read or write these tables
-- directly, even their own row — every read/write goes through
-- api/get-listed/* or api/admin/get-listed/*, each of which independently
-- verifies identity/admin authorization and applies
-- `.eq("id", campaignId).eq("owner_id", user.id)` (or the admin secret
-- check) server-side before touching the database. This is deliberately
-- the same pattern as the rest of the app rather than a new
-- RLS-policy-driven direct-client-access model, to avoid introducing a
-- second access pattern alongside the one already used everywhere else.
-- ---------------------------------------------------------------------------
alter table campaigns enable row level security;
alter table submissions enable row level security;
