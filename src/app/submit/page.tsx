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

  return <main className="mx-auto flex w-full min-w-0 max-w-4xl flex-col gap-7 px-3 pt-6 pb-[max(2rem,env(safe-area-inset-bottom))] sm:gap-8 sm:px-6 sm:pt-10">
    <Link href="/#waiting" className="flex min-h-11 w-fit items-center gap-2 text-sm text-muted hover:text-accent"><ArrowLeft className="h-4 w-4" />Back to the Arena</Link>
    <header className="mx-auto flex w-full max-w-2xl flex-col items-center gap-4 text-center">
      <span className="flex items-center gap-2 rounded-full border border-accent/20 bg-accent/5 px-3 py-2 text-xs font-bold text-accent"><Swords className="h-4 w-4" />Enter the Arena</span>
      <h1 className="font-display text-3xl leading-tight font-black text-ink sm:text-5xl">Your product deserves a challenger.</h1>
      <p className="text-sm leading-relaxed text-muted sm:text-base">Paste your website, review your details, and enter The Arena.</p>
      {category && <p className="rounded-xl border border-accent/25 bg-accent/5 p-3 text-sm leading-relaxed text-muted">You&apos;re entering <strong className="text-ink">{category}</strong>. Rivals are matched automatically using the existing category queue. This does not reserve a particular opponent.</p>}
    </header>
    {params.paid === "submit" && <p role="status" className="mx-auto w-full max-w-xl rounded-xl border border-border bg-surface p-4 text-sm text-muted">You&apos;ve returned from checkout. Once payment is confirmed, your product will appear in My Arena. Confirmation may take a moment.</p>}
    <SubmissionExperience key={category ?? "General"} initialCategory={category ?? "General"} />
  </main>;
}
