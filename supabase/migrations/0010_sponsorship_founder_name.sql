-- Founder name (a plain display name, distinct from the X handle) for the
-- admin-only "Add External Product" flow — /admin/sponsorships lets the
-- founder attach a human name to an external sponsorship it creates.
-- Nullable and unused by the regular paid flow.
alter table sponsorships add column founder_name text;
