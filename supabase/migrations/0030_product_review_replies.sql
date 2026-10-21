-- One official reply per product review. Existing reviews, votes, and claims are untouched.
create table public.product_review_replies (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null unique references public.product_reviews(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(btrim(body, E' \n\r\t')) between 10 and 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index product_review_replies_product_idx on public.product_review_replies(product_id);
create index product_review_replies_author_idx on public.product_review_replies(author_id);
alter table public.product_review_replies enable row level security;
revoke all on public.product_review_replies from public, anon, authenticated;
grant select (id, review_id, product_id, body, created_at, updated_at) on public.product_review_replies to anon, authenticated;
grant insert (review_id, product_id, author_id, body), update (body), delete on public.product_review_replies to authenticated;
grant all on public.product_review_replies to service_role;

-- Owner IDs and review author IDs remain private. This returns only an authorization result.
create function public.can_manage_product_review_reply(p_review uuid, p_product uuid, p_author uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and auth.uid() = p_author and exists (
    select 1 from public.product_reviews r join public.products p on p.id = r.product_id
    join auth.users u on u.id = p.owner_id
    where r.id = p_review and r.product_id = p_product and p.owner_id = auth.uid() and u.deleted_at is null
  );
$$;
revoke all on function public.can_manage_product_review_reply(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.can_manage_product_review_reply(uuid, uuid, uuid) to authenticated;

create policy product_review_replies_public_read on public.product_review_replies for select to anon, authenticated using (true);
create policy product_review_replies_owner_insert on public.product_review_replies for insert to authenticated
  with check (public.can_manage_product_review_reply(review_id, product_id, author_id));
create policy product_review_replies_owner_update on public.product_review_replies for update to authenticated
  using (public.can_manage_product_review_reply(review_id, product_id, author_id))
  with check (public.can_manage_product_review_reply(review_id, product_id, author_id));
create policy product_review_replies_owner_delete on public.product_review_replies for delete to authenticated
  using (public.can_manage_product_review_reply(review_id, product_id, author_id));

create function public.validate_product_review_reply()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_product uuid; v_owner uuid;
begin
  -- Serialize against ownership changes and review deletion during a write.
  select r.product_id, p.owner_id into v_product, v_owner
  from public.product_reviews r join public.products p on p.id = r.product_id
  where r.id = new.review_id for share of r, p;
  if not found or v_product <> new.product_id then
    raise exception 'Review does not belong to this product' using errcode = '23503';
  end if;
  if auth.uid() is null or v_owner is distinct from auth.uid() or new.author_id is distinct from auth.uid() then
    raise exception 'Only the verified product owner can reply' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' then
    if (new.id, new.review_id, new.product_id, new.author_id, new.created_at)
       is distinct from (old.id, old.review_id, old.product_id, old.author_id, old.created_at) then
      raise exception 'Reply identity cannot change' using errcode = '42501';
    end if;
    new.updated_at := clock_timestamp();
  else
    new.created_at := clock_timestamp();
    new.updated_at := new.created_at;
  end if;
  new.body := btrim(new.body, E' \n\r\t');
  return new;
end;
$$;
revoke all on function public.validate_product_review_reply() from public, anon, authenticated;
create trigger product_review_replies_validate before insert or update on public.product_review_replies
  for each row execute function public.validate_product_review_reply();

create function public.notify_product_review_reply()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_reviewer uuid; v_match uuid; v_name text;
begin
  select r.user_id, r.match_id, p.name into v_reviewer, v_match, v_name
  from public.product_reviews r join public.products p on p.id = r.product_id
  where r.id = new.review_id;
  if v_reviewer is distinct from new.author_id and exists (
    select 1 from auth.users where id = v_reviewer and deleted_at is null
  ) then
    -- In-app notifications stay on in existing preferences. No reply emails are requested.
    -- The review-based event key also deduplicates deletion followed by republication.
    perform public.enqueue_founder_notification(v_reviewer, 'founder-review-reply:' || new.review_id::text,
      'review_reply', 'Founder replied to your review',
      'The owner of ' || v_name || ' replied to your review.',
      '/duel/' || v_match::text || '?review=' || new.review_id::text || '#review-' || new.review_id::text,
      'review', false);
  end if;
  return new;
end;
$$;
revoke all on function public.notify_product_review_reply() from public, anon, authenticated;
create trigger product_review_replies_notify after insert on public.product_review_replies
  for each row execute function public.notify_product_review_reply();
