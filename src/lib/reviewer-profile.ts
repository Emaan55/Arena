import type { User } from "@supabase/supabase-js";
import { safeAvatarUrl } from "./arena-review-validation";

export type PublicReviewAuthor = { authorName: string; authorAvatarUrl: string | null };
export type PublicFounderReply = PublicReviewAuthor & { id: string; body: string; createdAt: string; updatedAt: string; canManage: boolean };
export type PublicProductReview = PublicReviewAuthor & { id: string; body: string; createdAt: string; reply?: PublicFounderReply | null };
export type StoredReviewerProfile = { author_name: string; profile_image_url: string | null; avatar_url: string | null };

function publicName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.trim();
  // Never fall back to an account's email, including emails in name metadata.
  if (!name || name.length > 100 || /[\u0000-\u001f\u007f]/.test(name) || /[^\s@]+@[^\s@]+\.[^\s@]+/.test(name)) return null;
  return name;
}

/** Only these two public fields may leave the server. No email or raw metadata. */
export function resolveReviewAuthor(user: User | null, stored?: StoredReviewerProfile): PublicReviewAuthor {
  if (!user || user.deleted_at) return { authorName: "Arena member", authorAvatarUrl: null };
  const metadata = user.user_metadata ?? {};
  const identities = user.identities?.map((identity) => identity.identity_data ?? {}) ?? [];
  // Same metadata fields and OAuth-first image order as UserProfileMenu.
  const names = [stored?.author_name, ...[metadata, ...identities].flatMap((profile) => [
    profile.full_name, profile.name, profile.display_name, profile.preferred_username, profile.user_name, profile.username,
  ])];
  const images = [...[metadata, ...identities].flatMap((profile) => [
    profile.avatar_url, profile.picture, profile.profile_image_url,
  ]), stored?.profile_image_url, stored?.avatar_url];
  return {
    authorName: names.map(publicName).find(Boolean) ?? "Arena member",
    authorAvatarUrl: images.map(safeAvatarUrl).find(Boolean) ?? null,
  };
}
