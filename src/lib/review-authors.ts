import "server-only";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { resolveReviewAuthor, type PublicReviewAuthor, type StoredReviewerProfile } from "./reviewer-profile";

/** Resolve only this review page's authors, not the first 1,000 Auth accounts. */
export async function getReviewAuthors(admin: SupabaseClient<Database>, userIds: string[], knownUsers: User[] = []) {
  const ids = [...new Set(userIds)].filter(Boolean);
  const authors = new Map<string, PublicReviewAuthor>();
  if (!ids.length) return authors;
  // Reuse the same stored public photo source as /api/profile/avatar.
  let stored: (StoredReviewerProfile & { user_id: string })[] = [];
  try {
    const { data } = await admin.from("arena_reviews")
      .select("user_id,author_name,profile_image_url,avatar_url").in("user_id", ids);
    stored = data ?? [];
  } catch {
    // Optional stored images must not prevent reading or publishing a review.
  }
  const storedById = new Map(stored.map((profile) => [profile.user_id, profile]));
  const knownById = new Map(knownUsers.map((user) => [user.id, user]));
  // Bound concurrency; review lists themselves are capped at 50 rows.
  for (let offset = 0; offset < ids.length; offset += 8) {
    await Promise.all(ids.slice(offset, offset + 8).map(async (id) => {
      try {
        const user = knownById.get(id) ?? (await admin.auth.admin.getUserById(id)).data.user;
        authors.set(id, resolveReviewAuthor(user, storedById.get(id)));
      } catch {
        authors.set(id, resolveReviewAuthor(null));
      }
    }));
  }
  return authors;
}
