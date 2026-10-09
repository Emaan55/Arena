-- Founder ownership, privacy-preserving product analytics, notification outbox,
-- notification preferences, admin-reviewed legacy claims, and announcements.

alter table public.products
  add column owner_id uuid references auth.users(id) on delete set null;
create index products_owner_id_idx on public.products(owner_id) where owner_id is not null;

-- Public clients keep read access to product presentation fields only. Ownership
-- and edit credentials are server-side columns, never returned through PostgREST.
revoke select on public.products from anon, authenticated;
grant select (
  id, name, url, pitch, category, status, wins, is_defending, submitted_at,
  pool_entered_at, uncontested_wins, battle_pitch, why_us, differentiators,
  x_handle, logo_url, logo_status, logo_checked_at, logo_next_attempt_at,
  logo_attempts, logo_source
) on public.products to anon, authenticated;

create table public.product_analytics_events (
  event_id uuid primary key,
  product_id uuid not null references public.products(id) on delete cascade,
  event_type text not null check (event_type in ('view', 'click')),
  visitor_day_hash text not null check (char_length(visitor_day_hash) = 64),
  occurred_at timestamptz not null default now()
);
create index product_analytics_events_product_idx on public.product_analytics_events(product_id, occurred_at desc);

create table public.product_analytics_daily (
  product_id uuid not null references public.products(id) on delete cascade,
  day date not null,
  page_views bigint not null default 0,
  unique_page_views bigint not null default 0,
  outbound_clicks bigint not null default 0,
  unique_outbound_clicks bigint not null default 0,
  primary key(product_id, day)
);

create table public.product_analytics_uniques (
  product_id uuid not null references public.products(id) on delete cascade,
  day date not null,
  metric text not null check (metric in ('view', 'click')),
  visitor_day_hash text not null check (char_length(visitor_day_hash) = 64),
  primary key(product_id, day, metric, visitor_day_hash)
);

create table public.arena_announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 1 and 140),
  body text not null check (char_length(btrim(body)) between 1 and 5000),
  status text not null default 'draft' check (status in ('draft', 'published')),
  email_requested boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  published_at timestamptz
);
create index arena_announcements_published_idx on public.arena_announcements(published_at desc) where status = 'published';

create table public.founder_notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  important_duel_updates boolean not null default false,
  review_notifications boolean not null default false,
  daily_vote_digest boolean not null default false,
  product_announcements boolean not null default false,
  get_listed_updates boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.founder_notification_preferences enable row level security;
revoke all on public.founder_notification_preferences from anon, authenticated;
grant all on public.founder_notification_preferences to service_role;

insert into public.founder_notification_preferences(user_id)
select id from auth.users on conflict(user_id) do nothing;

create or replace function public.create_founder_notification_preferences()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.founder_notification_preferences(user_id) values (new.id) on conflict(user_id) do nothing;
  return new;
end;
$$;
create trigger auth_user_founder_notification_preferences
  after insert on auth.users for each row execute function public.create_founder_notification_preferences();

create table public.founder_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_key text not null,
  event_type text not null,
  title text not null,
  body text not null,
  href text not null default '/dashboard',
  email_category text not null check (email_category in ('transactional', 'duel', 'review', 'digest', 'announcement', 'get_listed')),
  email_status text not null default 'skipped' check (email_status in ('queued', 'sending', 'sent', 'failed', 'skipped')),
  email_attempts integer not null default 0,
  email_next_attempt_at timestamptz not null default now(),
  email_locked_at timestamptz,
  email_sent_at timestamptz,
  email_last_error text,
  announcement_id uuid references public.arena_announcements(id) on delete cascade,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique(user_id, event_key)
);
create index founder_notifications_user_created_idx on public.founder_notifications(user_id, created_at desc, id desc);
create index founder_notifications_email_queue_idx on public.founder_notifications(email_next_attempt_at, created_at)
  where email_status in ('queued', 'sending');
alter table public.founder_notifications enable row level security;
revoke all on public.founder_notifications from anon, authenticated;
grant all on public.founder_notifications to service_role;

create table public.founder_product_claims (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  proof text not null check (char_length(btrim(proof)) between 10 and 2000),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_at timestamptz,
  reviewed_by text,
  created_at timestamptz not null default now()
);
create unique index founder_product_claims_pending_product_idx on public.founder_product_claims(product_id) where status = 'pending';
create unique index founder_product_claims_pending_user_product_idx on public.founder_product_claims(user_id, product_id) where status = 'pending';
alter table public.founder_product_claims enable row level security;
revoke all on public.founder_product_claims from anon, authenticated;
grant all on public.founder_product_claims to service_role;

alter table public.product_analytics_events enable row level security;
alter table public.product_analytics_daily enable row level security;
alter table public.product_analytics_uniques enable row level security;
alter table public.arena_announcements enable row level security;
revoke all on public.product_analytics_events, public.product_analytics_daily, public.product_analytics_uniques, public.arena_announcements from anon, authenticated;
grant all on public.product_analytics_events, public.product_analytics_daily, public.product_analytics_uniques, public.arena_announcements to service_role;

create or replace function public.record_product_analytics(
  p_event_id uuid, p_product_id uuid, p_event_type text, p_visitor_day_hash text, p_day date
) returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_inserted uuid;
  v_unique boolean := false;
begin
  if p_event_type not in ('view', 'click') or char_length(p_visitor_day_hash) <> 64 then return false; end if;
  insert into public.product_analytics_events(event_id, product_id, event_type, visitor_day_hash)
  values (p_event_id, p_product_id, p_event_type, p_visitor_day_hash)
  on conflict(event_id) do nothing returning event_id into v_inserted;
  if v_inserted is null then return false; end if;

  insert into public.product_analytics_uniques(product_id, day, metric, visitor_day_hash)
  values (p_product_id, p_day, p_event_type, p_visitor_day_hash)
  on conflict do nothing returning true into v_unique;
  v_unique := coalesce(v_unique, false);

  insert into public.product_analytics_daily(product_id, day, page_views, unique_page_views, outbound_clicks, unique_outbound_clicks)
  values (
    p_product_id, p_day,
    case when p_event_type = 'view' then 1 else 0 end,
    case when p_event_type = 'view' and v_unique then 1 else 0 end,
    case when p_event_type = 'click' then 1 else 0 end,
    case when p_event_type = 'click' and v_unique then 1 else 0 end
  )
  on conflict(product_id, day) do update set
    page_views = product_analytics_daily.page_views + excluded.page_views,
    unique_page_views = product_analytics_daily.unique_page_views + excluded.unique_page_views,
    outbound_clicks = product_analytics_daily.outbound_clicks + excluded.outbound_clicks,
    unique_outbound_clicks = product_analytics_daily.unique_outbound_clicks + excluded.unique_outbound_clicks;
  return true;
end;
$$;
revoke all on function public.record_product_analytics(uuid, uuid, text, text, date) from public, anon, authenticated;
grant execute on function public.record_product_analytics(uuid, uuid, text, text, date) to service_role;

create or replace function public.get_product_analytics(p_product_ids uuid[])
returns table(product_id uuid, page_views bigint, unique_page_views bigint, outbound_clicks bigint, unique_outbound_clicks bigint)
language sql stable security definer set search_path = '' as $$
  select d.product_id, sum(d.page_views), sum(d.unique_page_views), sum(d.outbound_clicks), sum(d.unique_outbound_clicks)
  from public.product_analytics_daily d
  where d.product_id = any(p_product_ids)
  group by d.product_id;
$$;
revoke all on function public.get_product_analytics(uuid[]) from public, anon, authenticated;
grant execute on function public.get_product_analytics(uuid[]) to service_role;

create or replace function public.enqueue_founder_notification(
  p_user_id uuid, p_event_key text, p_event_type text, p_title text, p_body text,
  p_href text, p_email_category text, p_email_requested boolean default false,
  p_announcement_id uuid default null
) returns void language plpgsql security definer set search_path = '' as $$
declare
  v_email_enabled boolean := false;
begin
  if p_user_id is null then return; end if;
  if p_email_category = 'transactional' then
    v_email_enabled := p_email_requested;
  elsif p_email_requested then
    select case p_email_category
      when 'duel' then coalesce(pref.important_duel_updates, false)
      when 'review' then coalesce(pref.review_notifications, false)
      when 'digest' then coalesce(pref.daily_vote_digest, false)
      when 'announcement' then coalesce(pref.product_announcements, false)
      when 'get_listed' then coalesce(pref.get_listed_updates, false)
      else false
    end into v_email_enabled
    from (select 1) seed
    left join public.founder_notification_preferences pref on pref.user_id = p_user_id;
  end if;

  insert into public.founder_notifications(
    user_id, event_key, event_type, title, body, href, email_category, email_status, announcement_id
  ) values (
    p_user_id, p_event_key, p_event_type, p_title, p_body, p_href, p_email_category,
    case when v_email_enabled then 'queued' else 'skipped' end, p_announcement_id
  ) on conflict(user_id, event_key) do nothing;
end;
$$;
revoke all on function public.enqueue_founder_notification(uuid, text, text, text, text, text, text, boolean, uuid) from public, anon, authenticated;
grant execute on function public.enqueue_founder_notification(uuid, text, text, text, text, text, text, boolean, uuid) to service_role;

create or replace function public.notify_product_submission()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.enqueue_founder_notification(new.owner_id, 'product-submitted:' || new.id::text, 'product_submitted',
    'Product entered the Arena', new.name || ' has been submitted and is now in the Arena.',
    '/product/' || new.id::text, 'transactional', true);
  return new;
end;
$$;
create trigger products_founder_submission_notification after insert on public.products for each row execute function public.notify_product_submission();

create or replace function public.notify_rival_matched()
returns trigger language plpgsql security definer set search_path = '' as $$
declare a public.products; b public.products;
begin
  select * into a from public.products where id = new.product_a_id;
  select * into b from public.products where id = new.product_b_id;
  perform public.enqueue_founder_notification(a.owner_id, 'duel-activated:' || new.id::text, 'rival_matched',
    'Your duel is live', a.name || ' is now battling ' || b.name || '.', '/duel/' || new.id::text, 'duel', true);
  perform public.enqueue_founder_notification(b.owner_id, 'duel-activated:' || new.id::text, 'rival_matched',
    'Your duel is live', b.name || ' is now battling ' || a.name || '.', '/duel/' || new.id::text, 'duel', true);
  return new;
end;
$$;
create trigger matches_founder_rival_notification after insert on public.matches for each row execute function public.notify_rival_matched();

create or replace function public.notify_vote_milestones()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_product_id uuid; v_owner_id uuid; v_name text; v_votes bigint; v_milestone integer;
begin
  if new.votes_a > old.votes_a then
    v_product_id := new.product_a_id;
    select owner_id, name into v_owner_id, v_name from public.products where id = v_product_id;
    select count(*) into v_votes from public.votes where match_id = new.id and side = 'a';
  elsif new.votes_b > old.votes_b then
    v_product_id := new.product_b_id;
    select owner_id, name into v_owner_id, v_name from public.products where id = v_product_id;
    select count(*) into v_votes from public.votes where match_id = new.id and side = 'b';
  else return new;
  end if;
  if v_owner_id is null then return new; end if;
  if v_votes = 1 then
    perform public.enqueue_founder_notification(v_owner_id, 'first-vote:' || new.id::text || ':' || v_product_id::text,
      'first_vote', 'Your product received its first vote', v_name || ' has received its first vote in this duel.',
      '/duel/' || new.id::text, 'duel', true);
  elsif v_votes in (25, 50, 75) then
    v_milestone := v_votes::integer;
    perform public.enqueue_founder_notification(v_owner_id, 'vote-milestone:' || new.id::text || ':' || v_product_id::text || ':' || v_milestone::text,
      'vote_milestone', v_milestone::text || ' votes for ' || v_name,
      v_name || ' reached ' || v_milestone::text || ' votes in its current duel.', '/duel/' || new.id::text, 'duel', true);
  end if;
  return new;
end;
$$;
create trigger matches_founder_vote_milestones after update of votes_a, votes_b on public.matches for each row execute function public.notify_vote_milestones();

create or replace function public.notify_duel_result()
returns trigger language plpgsql security definer set search_path = '' as $$
declare a public.products; b public.products; winner public.products; loser public.products; v_a integer; v_b integer;
begin
  if old.status <> 'active' or new.status <> 'resolved' then return new; end if;
  select * into a from public.products where id = new.product_a_id;
  select * into b from public.products where id = new.product_b_id;
  if new.votes_a >= 100 then winner := a; loser := b; else winner := b; loser := a; end if;
  v_a := greatest(new.votes_a, new.votes_b); v_b := least(new.votes_a, new.votes_b);
  perform public.enqueue_founder_notification(winner.owner_id, 'duel-result:' || new.id::text, 'duel_won',
    'You won the duel', winner.name || ' won against ' || loser.name || ' (' || v_a::text || '-' || v_b::text || ').',
    '/duel/' || new.id::text, 'duel', true);
  perform public.enqueue_founder_notification(loser.owner_id, 'duel-result:' || new.id::text, 'duel_lost',
    'Your duel has ended', loser.name || ' lost to ' || winner.name || ' (' || v_b::text || '-' || v_a::text || ').',
    '/duel/' || new.id::text, 'duel', true);
  return new;
end;
$$;
create trigger matches_founder_result_notification after update of status on public.matches for each row execute function public.notify_duel_result();

create or replace function public.notify_champion_crowned()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.status <> 'champion' and new.status = 'champion' then
    perform public.enqueue_founder_notification(new.owner_id,
      'champion-crowned:' || new.id::text || ':' || txid_current()::text, 'champion_crowned',
      'Champion crowned', new.name || ' is now champion of ' || new.category || '.', '/product/' || new.id::text, 'duel', true);
  end if;
  return new;
end;
$$;
create trigger products_founder_champion_notification after update of status on public.products for each row execute function public.notify_champion_crowned();

create or replace function public.notify_product_review()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_owner uuid; v_name text;
begin
  select owner_id, name into v_owner, v_name from public.products where id = new.product_id;
  perform public.enqueue_founder_notification(v_owner, 'product-review:' || new.id::text, 'new_review',
    'New review for ' || v_name, 'A voter left a new review for ' || v_name || '.',
    '/product/' || new.product_id::text, 'review', true);
  return new;
end;
$$;
create trigger product_reviews_founder_notification after insert on public.product_reviews for each row execute function public.notify_product_review();

create or replace function public.notify_get_listed_milestone()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status is distinct from old.status and new.status in ('in_progress', 'completed') then
    perform public.enqueue_founder_notification(new.owner_id,
      'get-listed:' || new.id::text || ':' || new.status, 'get_listed_milestone',
      case when new.status = 'completed' then 'Get Listed campaign completed' else 'Get Listed fulfillment started' end,
      'Your Get Listed campaign for ' || new.startup_name || ' is now ' || replace(new.status, '_', ' ') || '.',
      '/get-listed/campaigns/' || new.id::text, 'get_listed', true);
  end if;
  return new;
end;
$$;
create trigger campaigns_founder_milestone_notification after update of status on public.campaigns for each row execute function public.notify_get_listed_milestone();

create or replace function public.publish_arena_announcement()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.status = 'draft' and new.status = 'published' then
    insert into public.founder_notifications(user_id, event_key, event_type, title, body, href, email_category, email_status, announcement_id)
    select u.id, 'announcement:' || new.id::text, 'announcement', new.title, new.body,
      '/announcements/' || new.id::text, 'announcement',
      case when new.email_requested and coalesce(p.product_announcements, false) then 'queued' else 'skipped' end, new.id
    from auth.users u left join public.founder_notification_preferences p on p.user_id = u.id
    on conflict(user_id, event_key) do nothing;
    new.published_at := now();
  end if;
  return new;
end;
$$;
create trigger announcements_publish_fanout before update of status on public.arena_announcements for each row execute function public.publish_arena_announcement();

create or replace function public.create_daily_vote_digests(p_day date)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
  with product_votes as (
    select case when v.side = 'a' then m.product_a_id else m.product_b_id end as product_id, count(*)::bigint as votes
    from public.votes v join public.matches m on m.id = v.match_id
    where v.user_id is not null
      and v.created_at >= (p_day::timestamp at time zone 'UTC')
      and v.created_at < ((p_day + 1)::timestamp at time zone 'UTC')
    group by 1
  ), by_owner as (
    select p.owner_id, sum(pv.votes)::bigint as votes, count(*)::bigint as products
    from product_votes pv join public.products p on p.id = pv.product_id
    where p.owner_id is not null group by p.owner_id
  )
  insert into public.founder_notifications(user_id, event_key, event_type, title, body, href, email_category, email_status)
  select o.owner_id, 'daily-digest:' || p_day::text, 'daily_digest', 'Your Arena daily digest',
    o.votes::text || ' new vote' || case when o.votes = 1 then '' else 's' end || ' across ' || o.products::text || ' of your product' || case when o.products = 1 then '' else 's' end || ' yesterday.',
    '/dashboard', 'digest', 'queued'
  from by_owner o join public.founder_notification_preferences pref on pref.user_id = o.owner_id
  where pref.daily_vote_digest
  on conflict(user_id, event_key) do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke all on function public.create_daily_vote_digests(date) from public, anon, authenticated;
grant execute on function public.create_daily_vote_digests(date) to service_role;

create or replace function public.claim_founder_notification_emails(p_limit integer default 20)
returns setof public.founder_notifications language plpgsql security definer set search_path = '' as $$
begin
  return query
  with candidates as (
    select id from public.founder_notifications
    where (email_status = 'queued' and email_attempts < 8 and email_next_attempt_at <= now())
       or (email_status = 'sending' and email_locked_at < now() - interval '10 minutes')
    order by email_next_attempt_at, created_at
    for update skip locked limit greatest(1, least(p_limit, 50))
  )
  update public.founder_notifications n
  set email_status = 'sending', email_attempts = n.email_attempts + 1, email_locked_at = now()
  from candidates c where n.id = c.id returning n.*;
end;
$$;
revoke all on function public.claim_founder_notification_emails(integer) from public, anon, authenticated;
grant execute on function public.claim_founder_notification_emails(integer) to service_role;

create or replace function public.create_waiting_product_reminders(p_day date)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_count integer := 0; v_week text := to_char(date_trunc('week', p_day::timestamp), 'IYYY-IW'); v_product record;
begin
  for v_product in
    select p.id, p.owner_id, p.name, p.category
    from public.products p
    where p.owner_id is not null and p.status in ('active', 'unique')
      and p.pool_entered_at <= now() - interval '24 hours'
      and not exists (
        select 1 from public.matches m where m.status = 'active'
          and (m.product_a_id = p.id or m.product_b_id = p.id)
      )
  loop
    perform public.enqueue_founder_notification(v_product.owner_id,
      'waiting-reminder:' || v_product.id::text || ':' || v_week, 'waiting_for_rival',
      v_product.name || ' is waiting for a rival',
      v_product.name || ' has been waiting for a new rival in ' || v_product.category || '.',
      '/product/' || v_product.id::text, 'duel', true);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
revoke all on function public.create_waiting_product_reminders(date) from public, anon, authenticated;
grant execute on function public.create_waiting_product_reminders(date) to service_role;

create or replace function public.review_founder_product_claim(p_claim_id uuid, p_approve boolean, p_reviewer text)
returns public.founder_product_claims language plpgsql security definer set search_path = '' as $$
declare v_claim public.founder_product_claims; v_product_owner uuid;
begin
  select * into v_claim from public.founder_product_claims where id = p_claim_id and status = 'pending' for update;
  if v_claim.id is null then return null; end if;
  if p_approve then
    update public.products set owner_id = v_claim.user_id
      where id = v_claim.product_id and owner_id is null returning owner_id into v_product_owner;
    if v_product_owner is null then raise exception 'product_already_claimed' using errcode = '23505'; end if;
  end if;
  update public.founder_product_claims set status = case when p_approve then 'approved' else 'rejected' end,
    reviewed_at = now(), reviewed_by = p_reviewer where id = v_claim.id returning * into v_claim;
  return v_claim;
end;
$$;
revoke all on function public.review_founder_product_claim(uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.review_founder_product_claim(uuid, boolean, text) to service_role;

create or replace function public.notify_founder_claim_review()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.status = 'pending' and new.status in ('approved', 'rejected') then
    perform public.enqueue_founder_notification(new.user_id, 'claim-review:' || new.id::text,
      case when new.status = 'approved' then 'product_claim_approved' else 'product_claim_rejected' end,
      case when new.status = 'approved' then 'Product claim approved' else 'Product claim needs review' end,
      case when new.status = 'approved' then 'Your claim was approved. The product is now linked to your Arena dashboard.' else 'Your claim was not approved. Contact Arena support if you believe this was an error.' end,
      '/dashboard', 'transactional', true);
  end if;
  return new;
end;
$$;
create trigger founder_product_claim_review_notification after update of status on public.founder_product_claims for each row execute function public.notify_founder_claim_review();


-- Keep the aggregate history while limiting the retention of raw event IDs and visitor hashes.
create or replace function public.prune_product_analytics(p_unique_before date)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
  delete from public.product_analytics_events where occurred_at < now() - interval '30 days';
  get diagnostics v_count = row_count;
  delete from public.product_analytics_uniques where day < p_unique_before;
  return v_count;
end;
$$;
revoke all on function public.prune_product_analytics(date) from public, anon, authenticated;
grant execute on function public.prune_product_analytics(date) to service_role;
