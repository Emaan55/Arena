-- First-party Arena visitor count and an admin-maintained verified domain rating.
-- Visitor identifiers are one-way HMAC hashes. No IP address, user agent, or
-- visitor identity is stored or exposed publicly.

-- Soft-hide support for user-deleted in-app notifications. Keeping the row
-- preserves email delivery history and the existing unique event key.
alter table public.founder_notifications
  add column if not exists in_app_visible boolean not null default true;
create index if not exists founder_notifications_visible_idx
  on public.founder_notifications(user_id, created_at desc)
  where in_app_visible = true;

create table public.arena_site_visitors (
  visitor_hash text primary key check (char_length(visitor_hash) = 64),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  page_views bigint not null default 1 check (page_views > 0)
);
create index arena_site_visitors_last_seen_idx on public.arena_site_visitors(last_seen_at desc);

create table public.arena_public_metrics (
  id boolean primary key default true check (id),
  domain_rating numeric(5,2) check (domain_rating between 0 and 100),
  domain_rating_source text,
  domain_rating_source_url text,
  domain_rating_checked_at timestamptz,
  updated_at timestamptz not null default now()
);
insert into public.arena_public_metrics(id) values (true) on conflict(id) do nothing;

alter table public.arena_site_visitors enable row level security;
alter table public.arena_public_metrics enable row level security;
revoke all on public.arena_site_visitors, public.arena_public_metrics from anon, authenticated;
grant all on public.arena_site_visitors, public.arena_public_metrics to service_role;

create or replace function public.record_arena_site_visit(p_visitor_hash text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if char_length(p_visitor_hash) <> 64 then return; end if;
  insert into public.arena_site_visitors(visitor_hash)
  values (p_visitor_hash)
  on conflict(visitor_hash) do update set
    last_seen_at = now(),
    page_views = public.arena_site_visitors.page_views + 1;
end;
$$;
revoke all on function public.record_arena_site_visit(text) from public, anon, authenticated;
grant execute on function public.record_arena_site_visit(text) to service_role;

create or replace function public.get_arena_public_metrics()
returns table(
  domain_rating numeric,
  domain_rating_source text,
  domain_rating_source_url text,
  domain_rating_checked_at timestamptz,
  monthly_visitors bigint
) language sql stable security definer set search_path = '' as $$
  select
    m.domain_rating,
    m.domain_rating_source,
    m.domain_rating_source_url,
    m.domain_rating_checked_at,
    (select count(*) from public.arena_site_visitors v where v.last_seen_at >= now() - interval '30 days')::bigint
  from public.arena_public_metrics m
  where m.id = true;
$$;
revoke all on function public.get_arena_public_metrics() from public, anon, authenticated;
grant execute on function public.get_arena_public_metrics() to service_role;

