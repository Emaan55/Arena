-- Optional founder X handle on a sponsorship, collected for both Arena and
-- external products — same normalized-no-'@' convention as
-- products.x_handle (see src/lib/x-handle.ts), displayed via the existing
-- XHandleLink component wherever founder info is shown.
alter table sponsorships add column founder_x_handle text;
