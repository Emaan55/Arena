// Shared between SubmitForm (writes) and ProductEditor (reads) — kept out
// of lib/edit-token.ts since that file is server-only and this key format
// needs to be usable from client components too.
export function editTokenStorageKey(productId: string): string {
  return `arena_edit_token:${productId}`;
}
