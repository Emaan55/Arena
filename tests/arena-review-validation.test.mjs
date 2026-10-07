import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateArenaReview, safeAvatarUrl } from '../src/lib/arena-review-validation.ts';
const valid = { rating: 4, body: 'A useful place to discover new products.', category: 'Experience', productName: ' My product ' };
test('normalizes review copy and optional product attribution', () => {
  assert.deepEqual(validateArenaReview(valid).value, { rating: 4, body: valid.body, category: 'Experience', product_name: 'My product' });
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
  assert.equal(result.value.author_name, undefined);
  assert.equal(result.value.avatar_url, undefined);
});
test('only accepts credential-free HTTPS profile avatar URLs', () => {
  assert.equal(safeAvatarUrl('https://example.com/avatar.png'), 'https://example.com/avatar.png');
  for (const value of ['javascript:alert(1)', 'data:image/png;base64,aaa', 'http://example.com/a.png', 'https://user:pass@example.com/a.png', '/avatar.png', null]) assert.equal(safeAvatarUrl(value), null);
});
