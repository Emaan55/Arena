import type { VoteSide } from "@/types/database";

const STORAGE_KEY = "arena_pending_vote_review";

export interface PendingVoteReview {
  matchId: string;
  productId: string;
  productName: string;
  side: VoteSide;
}

function isPendingVoteReview(value: unknown): value is PendingVoteReview {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.matchId === "string" &&
    typeof record.productId === "string" &&
    typeof record.productName === "string" &&
    (record.side === "a" || record.side === "b")
  );
}

export function loadPendingVoteReview(): PendingVoteReview | null {
  if (typeof window === "undefined") return null;
  try {
    const parsed: unknown = JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) ?? "null");
    return isPendingVoteReview(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function savePendingVoteReview(review: PendingVoteReview) {
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(review));
}

export function clearPendingVoteReview(matchId?: string) {
  if (typeof window === "undefined") return;
  if (!matchId) {
    window.sessionStorage.removeItem(STORAGE_KEY);
    return;
  }
  const pending = loadPendingVoteReview();
  if (!pending || pending.matchId === matchId) {
    window.sessionStorage.removeItem(STORAGE_KEY);
  }
}

