import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, SubmissionStatus } from "@/types/database";

type AdminClient = SupabaseClient<Database>;

export async function isDirectoryLibraryReady(admin: AdminClient): Promise<boolean> {
  const { error } = await admin.from("directories").select("id").limit(1);
  return !error;
}

export interface DirectoryStats {
  total: number;
  accepted: number;
  pending: number;
  rejected: number;
  acceptanceRate: number | null;
  lastSubmittedAt: string | null;
}

/**
 * Same acceptance-rate definition as the customer report
 * (lib/get-listed/report.ts): accepted / (accepted + rejected), pending
 * excluded from the denominator, null (never a misleading 0%) when
 * nothing's resolved yet. This is descriptive only — no predictions or
 * quality rankings, per the Phase 3 spec.
 */
export function computeDirectoryStats(
  submissions: Array<{ status: SubmissionStatus; submitted_at: string | null; created_at: string }>,
): DirectoryStats {
  const accepted = submissions.filter((s) => s.status === "accepted").length;
  const rejected = submissions.filter((s) => s.status === "rejected").length;
  const pending = submissions.length - accepted - rejected;
  const resolvedCount = accepted + rejected;
  const dates = submissions.map((s) => s.submitted_at ?? s.created_at).sort();
  return {
    total: submissions.length,
    accepted,
    pending,
    rejected,
    acceptanceRate: resolvedCount > 0 ? Math.round((accepted / resolvedCount) * 1000) / 10 : null,
    lastSubmittedAt: dates.length > 0 ? dates[dates.length - 1] : null,
  };
}
