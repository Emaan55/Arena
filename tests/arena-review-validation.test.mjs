import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateArenaReview, safeAvatarUrl, normalizeReviewerSocial, reviewerAvatarSources } from '../src/lib/arena-review-validation.ts';
const valid = { displayName: ' Real Builder ', rating: 4, body: 'A useful place to discover new products.', category: 'Experience', productName: ' My product ' };
test('normalizes review copy and optional product attribution', () => {
  assert.deepEqual(validateArenaReview(valid).value, { rating: 4, body: valid.body, category: 'Experience', product_name: 'My product', author_name: 'Real Builder', social_platform: null, social_handle: null, social_url: null });
  assert.equal(validateArenaReview({ ...valid, productName: ' ' }).value.product_name, null);
});
test('requires a genuine integer rating within range', () => {
  for (const rating of [0, 6, 4.9, '5', null, undefined]) assert.ok(validateArenaReview({ ...valid, rating }).error);
});
test('rejects missing, short, and oversized review text and invalid categories', () => {
  for (const body of ['', 'too short', 'x'.repeat(501), '         ', '😀'.repeat(5)]) assert.ok(validateArenaReview({ ...valid, body }).error);
  assert.ok(validateArenaReview({ ...valid, category: 'Invented' }).error);
  assert.ok(validateArenaReview({ ...valid, productName: 'x'.repeat(81) }).error);
  assert.ok(validateArenaReview(null).error);
});
test('ignores impersonated identity in submission data', () => {
  const result = validateArenaReview({ ...valid, user_id: 'other-user', author_name: 'Pretend founder', avatar_url: 'https://example.com/a.png' });
  assert.equal(result.value.user_id, undefined);
  assert.equal(result.value.author_name, 'Real Builder');
  assert.equal(result.value.avatar_url, undefined);
});
test('only accepts credential-free HTTPS profile avatar URLs', () => {
  assert.equal(safeAvatarUrl('https://example.com/avatar.png'), 'https://example.com/avatar.png');
  for (const value of ['javascript:alert(1)', 'data:image/png;base64,aaa', 'http://example.com/a.png', 'https://user:pass@example.com/a.png', '/avatar.png', null]) assert.equal(safeAvatarUrl(value), null);
});

test('requires a public name without letting it replace account ownership', () => {
  for (const displayName of ['', ' ', 'x'.repeat(101), 'Name\nHeader']) assert.ok(validateArenaReview({ ...valid, displayName }).error);
  const result = validateArenaReview({ ...valid, displayName: 'Chosen Name', user_id: 'someone-else' });
  assert.equal(result.value.author_name, 'Chosen Name');
  assert.equal(result.value.user_id, undefined);
});
test('accepts X handles and canonicalizes X and legacy Twitter profile URLs', () => {
  for (const socialProfile of ['@arena_builder', 'arena_builder', 'https://x.com/arena_builder?ref=share', 'twitter.com/arena_builder']) {
    const result = validateArenaReview({ ...valid, socialPlatform: 'x', socialProfile });
    assert.equal(result.value.social_handle, 'arena_builder');
    assert.equal(result.value.social_url, 'https://x.com/arena_builder');
  }
});
test('accepts Instagram, LinkedIn, and other public profile links', () => {
  assert.equal(normalizeReviewerSocial('instagram', '@real.builder').value.social_url, 'https://www.instagram.com/real.builder/');
  assert.equal(normalizeReviewerSocial('instagram', 'https://instagram.com/real.builder/').value.social_handle, 'real.builder');
  assert.equal(normalizeReviewerSocial('linkedin', 'https://www.linkedin.com/in/real-builder/').value.social_handle, 'real-builder');
  assert.equal(normalizeReviewerSocial('other', 'https://bsky.app/profile/builder.example').value.social_url, 'https://bsky.app/profile/builder.example');
  assert.equal(normalizeReviewerSocial('x', '').value.social_platform, null);
});
test('rejects deceptive social hosts, posts, invalid handles, and unsafe links', () => {
  for (const input of ['https://x.com.evil.example/name', 'https://x.com@evil.example/name', 'https://x.com/name/status/123', 'https://x.com/home', 'https://x.com/name/extra', '@name with spaces', 'x'.repeat(16)]) assert.ok(normalizeReviewerSocial('x', input).error, input);
  for (const input of ['https://instagram.com/p/123', '@two..dots', '@trailing.', 'https://instagram.com.evil.example/name']) assert.ok(normalizeReviewerSocial('instagram', input).error, input);
  for (const input of ['https://linkedin.com/company/arena', 'https://linkedin.com/in/%2F', 'https://linkedin.com.evil.example/in/name']) assert.ok(normalizeReviewerSocial('linkedin', input).error, input);
  for (const input of ['javascript:alert(1)', 'http://example.com/you', 'https://user:pass@example.com/you', 'https://127.0.0.1/you', 'https://localhost/you', 'https://[::1]/you']) assert.ok(normalizeReviewerSocial('other', input).error, input);
});
test('uses uploaded photos, then real social lookups, then the account avatar', () => {
  const social = normalizeReviewerSocial('x', '@arena_builder').value;
  assert.deepEqual(reviewerAvatarSources({ ...social, profile_image_url: 'https://project.supabase.co/storage/v1/object/public/arena-review-avatars/photo.webp', avatar_url: 'https://example.com/account.png' }), [
    'https://project.supabase.co/storage/v1/object/public/arena-review-avatars/photo.webp',
    'https://unavatar.io/x/arena_builder?fallback=false',
    'https://example.com/account.png',
  ]);
  assert.deepEqual(reviewerAvatarSources({ ...normalizeReviewerSocial('other', 'https://example.com/profile').value, avatar_url: null }), []);
});
