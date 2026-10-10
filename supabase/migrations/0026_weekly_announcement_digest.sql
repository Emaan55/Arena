-- Bundle admin-selected Arena announcements into one weekly email while
-- continuing to publish every announcement in-app immediately.

alter table public.founder_notifications
  add column if not exists in_app_visible boolean not null default true;

-- Publishing creates one in-app item for every account. Announcement email
-- delivery is handled by create_weekly_announcement_digests below.
create or replace function public.publish_arena_announcement()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.status = 'draft' and new.status = 'published' then
    insert into public.founder_notifications(
      user_id, event_key, event_type, title, body, href,
      email_category, email_status, announcement_id, in_app_visible
    )
    select u.id, 'announcement:' || new.id::text, 'announcement', new.title, new.body,
      '/announcements/' || new.id::text, 'announcement', 'skipped', new.id, true
    from auth.users u
    on conflict(user_id, event_key) do nothing;
    new.published_at := now();
  end if;
  return new;
end;
$$;

create or replace function public.create_weekly_announcement_digests(p_week_start date)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
  with weekly as (
    select
      count(*)::integer as announcement_count,
      string_agg(
        a.title || E'\n' || a.body,
        E'\n\n',
        order by a.published_at asc, a.id asc
      ) as digest_body
    from public.arena_announcements a
    where a.status = 'published'
      and a.email_requested
      and a.published_at >= (p_week_start::timestamp at time zone 'UTC')
      and a.published_at < ((p_week_start + 7)::timestamp at time zone 'UTC')
  )
  insert into public.founder_notifications(
    user_id, event_key, event_type, title, body, href,
    email_category, email_status, in_app_visible
  )
  select
    pref.user_id,
    'weekly-announcement-digest:' || p_week_start::text,
    'weekly_announcement_digest',
    case
      when weekly.announcement_count = 1 then 'This week in The Arena'
      else weekly.announcement_count::text || ' updates from The Arena'
    end,
    left(weekly.digest_body, 12000),
    '/dashboard/notifications',
    'announcement',
    'queued',
    false
  from public.founder_notification_preferences pref
  cross join weekly
  where pref.product_announcements
    and weekly.announcement_count > 0
  on conflict(user_id, event_key) do nothing;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.create_weekly_announcement_digests(date) from public, anon, authenticated;
grant execute on function public.create_weekly_announcement_digests(date) to service_role;

create index if not exists founder_notifications_visible_user_idx
  on public.founder_notifications(user_id, created_at desc, id desc)
  where in_app_visible;

