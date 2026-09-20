-- Adds authenticated-user voting as a new, PARALLEL identity path for
-- votes, alongside (never replacing or deleting) the existing anonymous
-- fingerprint system. Historical anonymous votes are completely untouched:
-- user_id is nullable and only ever populated by new authenticated votes
-- going forward. No existing row, vote total, match, or champion is
-- modified by this migration.

alter table votes add column user_id uuid references auth.users (id) on delete set null;

-- voter_fingerprint was NOT NULL because every vote used to be anonymous.
-- Relaxed so an authenticated vote can omit it (its identity is user_id
-- instead) — every existing row already satisfies NOT NULL, so loosening
-- the constraint doesn't affect them.
alter table votes alter column voter_fingerprint drop not null;

-- Every vote is either an anonymous-fingerprint vote or an authenticated
-- vote, never both and never neither.
alter table votes add constraint votes_identity_check
  check (
    (voter_fingerprint is not null and user_id is null)
    or (voter_fingerprint is null and user_id is not null)
  );

-- One authenticated vote per user per duel — the authenticated-voting
-- analog of the existing unique(match_id, voter_fingerprint) constraint
-- below. A partial index is correct here since user_id is null on every
-- historical (anonymous) row and Postgres unique indexes ignore nulls.
create unique index votes_user_match_unique_idx
  on votes (match_id, user_id)
  where user_id is not null;

create index votes_user_id_idx on votes (user_id) where user_id is not null;

-- Atomic authenticated vote casting — identical shape and guarantees to
-- the existing cast_vote() (itself untouched, still used by any anonymous
-- vote path), just keyed by a verified auth.users id instead of a
-- client-derived fingerprint hash.
create or replace function cast_vote_authenticated(p_match_id uuid, p_user_id uuid, p_side text)
returns matches
language plpgsql
as $$
declare
  v_match matches;
begin
  insert into votes (match_id, user_id, side)
  values (p_match_id, p_user_id, p_side);

  if p_side = 'a' then
    update matches set votes_a = votes_a + 1
      where id = p_match_id and status = 'active'
      returning * into v_match;
  else
    update matches set votes_b = votes_b + 1
      where id = p_match_id and status = 'active'
      returning * into v_match;
  end if;

  if v_match.id is null then
    raise exception 'match_not_active' using errcode = 'P0001';
  end if;

  return v_match;
end;
$$;

-- No RLS policy changes: votes already has zero policies for the anon/
-- authenticated roles (see migration 0001), meaning it was already
-- unreachable except through the service-role admin client used by
-- server-side route handlers. That remains true and is exactly correct
-- here too — authenticated votes are still only ever inserted by the
-- admin client in src/app/api/votes/route.ts, after that route
-- independently verifies the caller's session server-side. A signed-in
-- user's own Supabase client can never insert into votes directly,
-- regardless of auth state.
