-- Persistent, cross-serverless-instance abuse-signal tracking for the free
-- vote endpoint. This is a SECONDARY abuse-friction layer on top of the
-- existing vote-integrity guarantee (votes' unique(match_id,
-- voter_fingerprint) constraint + the atomic cast_vote() function), which
-- this migration does not touch. Never stores a raw IP address — only a
-- salted SHA-256 hash of it (see hashIpForAbuseTracking in
-- lib/vote-abuse.ts) — and only tracks the small amount of aggregate state
-- needed to rate-limit, never a per-request log.

-- Fixed-window event counters (e.g. "how many new voter identities has
-- this ip_hash minted in the last 10 minutes"). One row per
-- (ip_hash, event_type, window). Atomically bumped via bump_abuse_window()
-- below, so concurrent requests landing on different serverless instances
-- can never under-count the same window — unlike the in-memory limiter in
-- lib/rate-limit.ts, which stays in place for its existing, cheaper,
-- single-instance-best-effort uses.
create table vote_abuse_windows (
  ip_hash text not null,
  event_type text not null,
  window_start timestamptz not null,
  count int not null default 1,
  primary key (ip_hash, event_type, window_start)
);

create index vote_abuse_windows_window_start_idx on vote_abuse_windows (window_start);

create or replace function bump_abuse_window(p_ip_hash text, p_event_type text, p_window_seconds int)
returns int
language plpgsql
as $$
declare
  v_window_start timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  v_count int;
begin
  insert into vote_abuse_windows (ip_hash, event_type, window_start, count)
  values (p_ip_hash, p_event_type, v_window_start, 1)
  on conflict (ip_hash, event_type, window_start)
    do update set count = vote_abuse_windows.count + 1
  returning count into v_count;

  -- Opportunistic cleanup piggybacked on ~1 in 50 calls instead of a cron
  -- job — the same lazy-maintenance pattern this app already uses (see
  -- markStaleWaitingProductsUnique in lib/arena.ts).
  if random() < 0.02 then
    delete from vote_abuse_windows where window_start < now() - interval '1 day';
  end if;

  return v_count;
end;
$$;

-- Tracks which duels (match ids) a given ip_hash has recently attempted to
-- vote in, so "spraying votes across an unusually large number of
-- different duels in a short window" can be detected without logging
-- every individual vote attempt. One row per (ip_hash, match_id) pair,
-- with last_seen refreshed on every attempt.
create table vote_abuse_recent_matches (
  ip_hash text not null,
  match_id uuid not null,
  last_seen timestamptz not null default now(),
  primary key (ip_hash, match_id)
);

create index vote_abuse_recent_matches_lookup_idx on vote_abuse_recent_matches (ip_hash, last_seen);

create or replace function record_recent_match_and_count(p_ip_hash text, p_match_id uuid, p_window_seconds int)
returns int
language plpgsql
as $$
declare
  v_count int;
begin
  insert into vote_abuse_recent_matches (ip_hash, match_id, last_seen)
  values (p_ip_hash, p_match_id, now())
  on conflict (ip_hash, match_id) do update set last_seen = now();

  select count(*) into v_count
  from vote_abuse_recent_matches
  where ip_hash = p_ip_hash and last_seen > now() - (p_window_seconds || ' seconds')::interval;

  if random() < 0.02 then
    delete from vote_abuse_recent_matches where last_seen < now() - interval '1 hour';
  end if;

  return v_count;
end;
$$;
