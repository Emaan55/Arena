-- Product submission gets a second path alongside a $1 payment: earn one
-- free submission by voting on 5 distinct duels and leaving 2 reviews.
-- Vote and review counts are derived live from the existing votes/
-- product_reviews tables (never duplicated) — the only new state genuinely
-- required is how many free submissions a user has already consumed, since
-- nothing else in the schema represents that.

-- Same pattern as migration 0007's sponsor addition: widen the existing
-- payments type check for the new 'submit' ($1 product-submission) type,
-- rather than a separate, untracked payment path.
alter table payments drop constraint if exists payments_type_check;
alter table payments add constraint payments_type_check
  check (type in ('boost', 'revive', 'defend', 'sponsor', 'submit'));

create table free_submission_claims (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Linked once the claimed submission actually succeeds (see the
  -- POST /api/products route) — the API deletes the claim outright if
  -- product creation fails after a successful claim, so a validation
  -- failure (duplicate URL, etc.) never burns the user's earned reward.
  product_id uuid references products (id) on delete set null,
  created_at timestamptz not null default now()
);

create index free_submission_claims_user_id_idx on free_submission_claims (user_id);

-- Same zero-policy RLS posture as every other mutable table in this app —
-- reachable only through the service-role admin client from server-side
-- route handlers, which independently verify the caller's session first.
alter table free_submission_claims enable row level security;

-- Atomically checks eligibility and reserves exactly one claim in the same
-- transaction. `pg_advisory_xact_lock` serializes concurrent calls for the
-- same user (held until the transaction ends), so two simultaneous submit
-- requests can never both pass the eligibility check against the same
-- single earned submission — the second call blocks until the first
-- commits its claim, then re-evaluates with that claim already counted.
-- Returns the new claim's id, or null if the user isn't currently
-- eligible for another free submission.
create or replace function claim_free_submission(p_user_id uuid)
returns uuid
language plpgsql
as $$
declare
  v_votes integer;
  v_reviews integer;
  v_consumed integer;
  v_available integer;
  v_claim_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext(p_user_id::text));

  select count(distinct match_id) into v_votes from votes where user_id = p_user_id;
  select count(*) into v_reviews from product_reviews where user_id = p_user_id;
  select count(*) into v_consumed from free_submission_claims where user_id = p_user_id;

  v_available := least(v_votes / 5, v_reviews / 2) - v_consumed;

  if v_available < 1 then
    return null;
  end if;

  insert into free_submission_claims (user_id) values (p_user_id)
  returning id into v_claim_id;

  return v_claim_id;
end;
$$;
