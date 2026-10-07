-- Public, self-described reviewer profiles. Account ownership still comes
-- exclusively from the authenticated session, not the entered social handle.
alter table public.arena_reviews
  add column social_platform text check (social_platform in ('x', 'instagram', 'linkedin', 'other')),
  add column social_handle text check (char_length(social_handle) <= 100),
  add column social_url text check (char_length(social_url) <= 500),
  add column profile_image_url text,
  add constraint arena_reviews_social_profile_complete check (
    (social_platform is null and social_handle is null and social_url is null)
    or (social_platform is not null and social_url is not null)
  );

-- The API verifies auth, decodes and resizes the image, then uploads using
-- the service role. No browser upload policies are added. Public read access
-- is intentional: these are the photos reviewers choose to publish.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('arena-review-avatars', 'arena-review-avatars', true, 2097152, array['image/webp'])
on conflict (id) do nothing;
