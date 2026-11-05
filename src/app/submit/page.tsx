import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Swords } from "lucide-react";
import { createServerComponentSupabaseClient } from "@/lib/supabase/server";
import { submissionCategory, submissionPath } from "@/lib/submission-path";
import { SubmissionExperience } from "@/components/SubmissionExperience";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Submit your product | The Arena", robots: { index: false, follow: false } };

export default async function SubmitPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const category = submissionCategory(params.category);
  const destination = submissionPath(category);
  const auth = await createServerComponentSupabaseClient();
  const { data: { user }, error } = await auth.auth.getUser();
  if (error || !user) redirect(`/auth/sign-up?next=${encodeURIComponent(destination)}`);

  return <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-3 py-8 sm:px-6 sm:py-12">
    <Link href="/#waiting" className="flex min-h-11 w-fit items-center gap-2 text-sm text-muted hover:text-accent"><ArrowLeft className="h-4 w-4" />Back to the Arena</Link>
    <header className="mx-auto flex w-full max-w-xl flex-col gap-3">
      <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-accent"><Swords className="h-4 w-4" />Enter the Arena</span>
      <h1 className="font-display text-3xl font-black text-ink sm:text-4xl">Submit your product</h1>
      <p className="text-sm leading-relaxed text-muted">Share what you&apos;ve built. Pay $1 to submit now, or use a free submission earned through votes and reviews.</p>
      {category && <p className="rounded-xl border border-accent/25 bg-accent/5 p-3 text-sm leading-relaxed text-muted">You&apos;re entering <strong className="text-ink">{category}</strong>. Rivals are matched automatically using the existing category queue. This does not reserve a particular opponent.</p>}
    </header>
    {params.paid === "submit" && <p role="status" className="mx-auto w-full max-w-xl rounded-xl border border-border bg-surface p-4 text-sm text-muted">You&apos;ve returned from checkout. Once payment is confirmed, your product will appear in My Arena. Confirmation may take a moment.</p>}
    <SubmissionExperience key={category ?? "General"} initialCategory={category ?? "General"} />
  </main>;
}
