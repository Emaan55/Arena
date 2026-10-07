-- Reviews of THE ARENA itself. Product post-vote reviews remain unchanged.
-- Identity is copied from the authenticated profile server-side, never from
-- the submission payload. One experience review per account.
create table public.arena_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  author_name text not null check (char_length(author_name) between 1 and 100),
  avatar_url text,
  product_name text check (char_length(product_name) <= 80),
  rating smallint not null check (rating between 1 and 5),
  body text not null check (char_length(btrim(body)) between 10 and 500),
  category text not null check (category in ('Visibility', 'Community', 'Product Discovery', 'Experience')),
  created_at timestamptz not null default now()
);
create index arena_reviews_recent_idx on public.arena_reviews(created_at desc, id desc);
alter table public.arena_reviews enable row level security;
-- No browser policies: reads and writes go through the reviewed API.
revoke all on public.arena_reviews from anon, authenticated;
grant all on public.arena_reviews to service_role;

-- Calculate over the complete wall, never just a paginated preview.
create function public.arena_review_stats()
returns table (total bigint, average_rating numeric)
language sql stable security invoker set search_path = '' as $$
  select count(*), round(avg(rating), 2) from public.arena_reviews;
$$;
revoke all on function public.arena_review_stats() from public, anon, authenticated;
grant execute on function public.arena_review_stats() to service_role;
