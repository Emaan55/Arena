-- Get Listed promotion campaign redesign.
--
-- Existing package keys and paid rows remain untouched. The new packages use
-- distinct keys so old Starter/Growth/Scale orders are never reinterpreted as
-- the new service. Every new campaign snapshots its label/version/duration and
-- creates a concrete deliverable checklist at campaign creation time.

alter table public.campaigns
  drop constraint if exists campaigns_package_key_check;

alter table public.campaigns
  add constraint campaigns_package_key_check check (
    package_key in (
      'starter', 'growth', 'scale',
      'launch_starter', 'growth_campaign', 'launch_accelerator'
    )
  );

alter table public.orders
  drop constraint if exists orders_package_key_check;

alter table public.orders
  add constraint orders_package_key_check check (
    package_key in (
      'starter', 'growth', 'scale',
      'launch_starter', 'growth_campaign', 'launch_accelerator'
    )
  );

alter table public.campaigns
  add column package_label text,
  add column package_version int not null default 1 check (package_version > 0),
  add column campaign_duration_days int check (campaign_duration_days is null or campaign_duration_days > 0),
  add column target_audience text,
  add column demo_access_notes text;

update public.campaigns
set package_label = case package_key
  when 'starter' then 'Starter'
  when 'growth' then 'Growth'
  when 'scale' then 'Scale'
  else package_key
end
where package_label is null;

alter table public.campaigns alter column package_label set not null;

create table public.campaign_deliverables (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  deliverable_key text not null,
  kind text not null check (kind in (
    'directory', 'x_post', 'linkedin_post', 'youtube_video', 'youtube_short',
    'graphic', 'showcase', 'strategy', 'update', 'report'
  )),
  title text not null,
  purpose text not null,
  position int not null default 0,
  status text not null default 'pending' check (status in ('pending', 'in_progress', 'completed', 'not_applicable')),
  public_url text,
  asset_url text,
  customer_notes text,
  admin_notes text,
  metrics jsonb not null default '{}'::jsonb,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, deliverable_key)
);

create index campaign_deliverables_campaign_position_idx
  on public.campaign_deliverables (campaign_id, position, created_at);
create index campaign_deliverables_status_idx
  on public.campaign_deliverables (status);

-- Match the existing Get Listed security model: customers/admins only reach
-- these rows through server routes that verify ownership or ADMIN_SECRET.
alter table public.campaign_deliverables enable row level security;
revoke all on public.campaign_deliverables from anon, authenticated;

