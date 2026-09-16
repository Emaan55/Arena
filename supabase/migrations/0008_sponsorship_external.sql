-- Lets a sponsorship point at an arbitrary external URL instead of an
-- existing Arena product — "anyone can pay to promote ANY product," not
-- just ones already submitted to the Arena — and stores a once-resolved
-- favicon so the Sponsored section never has to re-fetch it. See
-- src/lib/url-metadata.ts (favicon/title resolution) and
-- src/lib/sponsorship-constants.ts (resolveSponsorshipDisplay, which reads
-- either side of this).

alter table sponsorships alter column product_id drop not null;

alter table sponsorships add column is_external boolean not null default false;
alter table sponsorships add column external_name text;
alter table sponsorships add column external_url text;
alter table sponsorships add column external_category text;
alter table sponsorships add column external_description text;
alter table sponsorships add column logo_url text;

-- Exactly one of "backed by an Arena product" or "external listing" — never
-- both, never neither.
alter table sponsorships add constraint sponsorships_source_check check (
  (product_id is not null and is_external = false)
  or
  (product_id is null and is_external = true and external_name is not null and external_url is not null)
);
