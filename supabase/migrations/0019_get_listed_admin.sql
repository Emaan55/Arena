-- Get Listed admin dashboard (Phase 1): soft-delete for campaigns and a
-- unified admin activity/audit timeline. Deliberately additive only —
-- no existing column, table, or business logic (payment/webhook/discount
-- redemption) is touched.

-- Soft delete: a deleted campaign keeps every row (submissions, orders,
-- payment_reconciliations) exactly as-is. It's simply hidden from the
-- default admin campaign list until restored. There is no account system
-- in this app (see lib/admin-auth.ts's single shared ADMIN_SECRET), so
-- `deleted_by` is free text (whatever the admin typed in), matching the
-- same convention as payment_reconciliations.admin_identifier — never a
-- foreign key to a user table that doesn't model "admin" as an identity.
alter table campaigns add column deleted_at timestamptz;
alter table campaigns add column deleted_by text;

-- Used on every admin campaign list load to exclude/include deleted rows.
create index campaigns_deleted_at_idx on campaigns (deleted_at);

-- One unified activity timeline across everything an admin (or the
-- payment webhook, as "system") does to a campaign — status changes,
-- edits, delete/restore, submission add/edit, and payment reconciliation.
-- `admin_identifier` is nullable specifically so a real LemonSqueezy
-- webhook-driven payment event (not an admin action at all) can still
-- appear in the timeline as a system entry, distinguishable from an
-- admin-initiated one.
create table admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns (id) on delete cascade,
  submission_id uuid references submissions (id) on delete set null,
  admin_identifier text,
  action text not null,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index admin_audit_logs_campaign_id_idx on admin_audit_logs (campaign_id, created_at desc);

-- Same zero-policy RLS posture as every other mutable table in this app
-- (see migration 0001 and 0015's comments) — reachable only through the
-- service-role admin client from server-side route handlers, which
-- independently verify admin authorization before every read or write.
alter table admin_audit_logs enable row level security;
