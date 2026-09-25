-- Get Listed Phase 3: an internal, reusable Directory Library, linked to
-- submissions optionally so the admin can pick a known directory instead
-- of retyping it every time. Additive only — no existing column, table,
-- or business logic (payment/webhook/report calculation) is touched.

create table directories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  website_url text not null,
  submission_url text,
  category text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  -- Admin-only operational notes (submission requirements, known issues,
  -- review behavior) — never surfaced in a customer report. Distinct from
  -- a submission's own notes (see migration 0015's submissions table),
  -- which are campaign-specific ("submitted using the founder's updated
  -- logo") rather than reusable directory-level guidance.
  notes text,
  typical_review_time text,
  difficulty text,
  free_or_paid text,
  last_checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index directories_status_idx on directories (status);
create index directories_category_idx on directories (category);

-- Nullable, on delete set null: a submission is a snapshot of what was
-- actually done (directory_name/directory_url already on the row since
-- migration 0015), never a live join to the library. Editing or even
-- deleting a library entry later must never change historical submission
-- rows — this column only exists to (a) prefill the add-submission form
-- and (b) compute directory-level stats and duplicate-submission checks;
-- it is never read by anything customer-facing.
alter table submissions add column directory_id uuid references directories (id) on delete set null;

-- Prevents the same library directory from being added to the same
-- campaign twice — an atomic DB-level guard, not just a frontend check.
-- Partial (only when directory_id is set) since a Postgres unique index
-- ignores nulls, so any number of manually-typed (non-library) submissions
-- are unaffected.
create unique index submissions_campaign_directory_unique_idx
  on submissions (campaign_id, directory_id)
  where directory_id is not null;

create index submissions_directory_id_idx on submissions (directory_id) where directory_id is not null;

-- Same zero-policy RLS posture as every other mutable table in this app —
-- reachable only through the service-role admin client from server-side
-- route handlers, which independently verify admin authorization before
-- every read or write.
alter table directories enable row level security;

-- Directory Library actions (created/edited/activated/deactivated) have no
-- campaign at all — they're library-wide, not scoped to any one
-- customer's campaign. Reusing the existing admin_audit_logs table (Phase
-- 1, migration 0019) for these means relaxing campaign_id to nullable
-- rather than building a second audit table just for this. Every
-- campaign-scoped read of this table (`where campaign_id = ...`) is
-- unaffected — a null-campaign row simply never matches one.
alter table admin_audit_logs alter column campaign_id drop not null;
