-- Public, admin-curated Get Listed campaign results.
--
-- These records are independent of payment and fulfillment state. A result
-- can be drafted, published, updated, or hidden without changing its campaign,
-- order, discount, or deliverable history.

create table public.campaign_results (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null unique references public.campaigns (id) on delete cascade,
  product_name text not null check (char_length(product_name) between 1 and 100),
  logo_url text,
  website_url text not null,
  package_label text not null check (char_length(package_label) between 1 and 100),
  campaign_duration_days int check (campaign_duration_days is null or campaign_duration_days > 0),
  domain_rating numeric(5,2) check (domain_rating is null or (domain_rating >= 0 and domain_rating <= 100)),
  dr_source text not null default 'Ahrefs' check (dr_source = 'Ahrefs'),
  dr_recorded_at date,
  dr_evidence_url text,
  is_published boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((domain_rating is null and dr_recorded_at is null) or (domain_rating is not null and dr_recorded_at is not null))
);

create table public.campaign_result_platforms (
  id uuid primary key default gen_random_uuid(),
  campaign_result_id uuid not null references public.campaign_results (id) on delete cascade,
  platform text not null check (platform in ('youtube', 'linkedin', 'x')),
  published_url text not null,
  views bigint check (views is null or views >= 0),
  views_recorded_at date,
  evidence_url text,
  position int not null default 0 check (position >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_result_id, published_url),
  check (views is null or views_recorded_at is not null)
);

create index campaign_results_public_order_idx
  on public.campaign_results (updated_at desc, published_at desc)
  where is_published = true;
create index campaign_result_platforms_result_position_idx
  on public.campaign_result_platforms (campaign_result_id, position, created_at);

alter table public.campaign_results enable row level security;
alter table public.campaign_result_platforms enable row level security;

revoke all on public.campaign_results from anon, authenticated;
revoke all on public.campaign_result_platforms from anon, authenticated;
grant select on public.campaign_results to anon, authenticated;
grant select on public.campaign_result_platforms to anon, authenticated;

create policy "Published campaign results are public"
  on public.campaign_results for select
  to anon, authenticated
  using (is_published = true);

create policy "Platforms for published campaign results are public"
  on public.campaign_result_platforms for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.campaign_results result
      where result.id = campaign_result_id
        and result.is_published = true
    )
  );

-- Replacing the child rows and saving the parent happen in one transaction,
-- so a failed platform insert cannot leave a published result half-updated.
create or replace function public.save_campaign_result(
  p_campaign_id uuid,
  p_product_name text,
  p_logo_url text,
  p_website_url text,
  p_package_label text,
  p_campaign_duration_days int,
  p_domain_rating numeric,
  p_dr_recorded_at date,
  p_dr_evidence_url text,
  p_is_published boolean,
  p_platforms jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result_id uuid;
begin
  if not exists (select 1 from public.campaigns where id = p_campaign_id) then
    raise exception 'Campaign not found';
  end if;

  insert into public.campaign_results (
    campaign_id,
    product_name,
    logo_url,
    website_url,
    package_label,
    campaign_duration_days,
    domain_rating,
    dr_source,
    dr_recorded_at,
    dr_evidence_url,
    is_published,
    published_at,
    updated_at
  ) values (
    p_campaign_id,
    p_product_name,
    p_logo_url,
    p_website_url,
    p_package_label,
    p_campaign_duration_days,
    p_domain_rating,
    'Ahrefs',
    p_dr_recorded_at,
    p_dr_evidence_url,
    p_is_published,
    case when p_is_published then now() else null end,
    now()
  )
  on conflict (campaign_id) do update set
    product_name = excluded.product_name,
    logo_url = excluded.logo_url,
    website_url = excluded.website_url,
    package_label = excluded.package_label,
    campaign_duration_days = excluded.campaign_duration_days,
    domain_rating = excluded.domain_rating,
    dr_source = 'Ahrefs',
    dr_recorded_at = excluded.dr_recorded_at,
    dr_evidence_url = excluded.dr_evidence_url,
    is_published = excluded.is_published,
    published_at = case
      when excluded.is_published and not campaign_results.is_published then now()
      else campaign_results.published_at
    end,
    updated_at = now()
  returning id into v_result_id;

  delete from public.campaign_result_platforms
  where campaign_result_id = v_result_id;

  insert into public.campaign_result_platforms (
    campaign_result_id,
    platform,
    published_url,
    views,
    views_recorded_at,
    evidence_url,
    position
  )
  select
    v_result_id,
    item->>'platform',
    item->>'published_url',
    nullif(item->>'views', '')::bigint,
    nullif(item->>'views_recorded_at', '')::date,
    nullif(item->>'evidence_url', ''),
    ordinality::int - 1
  from jsonb_array_elements(coalesce(p_platforms, '[]'::jsonb)) with ordinality as rows(item, ordinality);

  return v_result_id;
end;
$$;

revoke all on function public.save_campaign_result(uuid, text, text, text, text, int, numeric, date, text, boolean, jsonb)
  from public, anon, authenticated;
grant execute on function public.save_campaign_result(uuid, text, text, text, text, int, numeric, date, text, boolean, jsonb)
  to service_role;
