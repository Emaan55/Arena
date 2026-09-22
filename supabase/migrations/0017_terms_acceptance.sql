-- Records that a user accepted the Terms & Privacy Policy at sign-up time
-- (email/password only — an X OAuth account has no separate consent step
-- since there's no form to attach a checkbox to). Minimal by design: only
-- what's needed to prove consent existed (who, when, which version) —
-- never anything about the acceptance beyond that.
create table terms_acceptances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  accepted_at timestamptz not null default now(),
  terms_version text not null,
  privacy_version text not null
);

create index terms_acceptances_user_id_idx on terms_acceptances (user_id);

-- Same zero-policy RLS posture as every other mutable table in this app —
-- written once, server-side, inside POST /api/auth/sign-up using the
-- service-role admin client, in the same request that creates the account.
alter table terms_acceptances enable row level security;
