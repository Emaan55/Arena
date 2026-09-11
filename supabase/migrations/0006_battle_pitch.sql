-- Battle Pitch, Founder X handle, and a lightweight ownership token so a
-- submitter can edit their own product later without a full auth system.
--
-- All new columns are nullable/defaulted so every existing product keeps
-- working unchanged — the app falls back to the existing `pitch` field
-- wherever battle_pitch/why_us/differentiators are absent.

alter table products
  add column battle_pitch text,
  add column why_us text,
  add column differentiators text[] not null default '{}',
  add column x_handle text,
  add column edit_token_hash text;

alter table products
  add constraint products_battle_pitch_len check (battle_pitch is null or char_length(battle_pitch) <= 120),
  add constraint products_why_us_len check (why_us is null or char_length(why_us) <= 160),
  add constraint products_differentiators_len check (
    array_length(differentiators, 1) is null or array_length(differentiators, 1) <= 3
  ),
  -- X/Twitter handles: 1-15 chars, letters/digits/underscore, no leading '@'
  -- (the '@' is display-only, added by the UI).
  add constraint products_x_handle_format check (x_handle is null or x_handle ~ '^[A-Za-z0-9_]{1,15}$');

-- Existing products have no edit_token_hash and are therefore not editable
-- through the new PATCH endpoint (nothing can hash-match a null token) —
-- intentional: we never had a submitter identity for them to hand out a
-- token retroactively, so they simply stay as originally submitted until an
-- admin sets one directly if ever needed.
