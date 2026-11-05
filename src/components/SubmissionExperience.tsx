"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import type { Category, Product } from "@/types/database";
import { SubmitForm } from "./SubmitForm";

export function SubmissionExperience({ initialCategory }: { initialCategory: Category }) {
  const [submitted, setSubmitted] = useState<Product | null>(null);
  return <div className="flex flex-col gap-4">
    {!submitted && <SubmitForm initialCategory={initialCategory} onSubmitted={(product) => setSubmitted(product)} />}
    {submitted && <section role="status" className="mx-auto flex w-full max-w-3xl flex-col gap-3 rounded-2xl border border-accent/30 bg-accent/5 p-5">
      <h2 className="flex items-center gap-2 font-display font-bold text-ink"><CheckCircle2 className="h-5 w-5 shrink-0 text-accent" />{submitted.name} has entered the Arena</h2>
      <p className="text-sm text-muted">View your product to follow its duel or waiting status.</p>
      <div className="flex flex-wrap gap-2">
        <Link href={`/product/${submitted.id}`} className="inline-flex min-h-11 items-center rounded-lg bg-accent px-4 text-sm font-bold text-accent-ink">View your product</Link>
        <Link href="/dashboard" className="inline-flex min-h-11 items-center rounded-lg border border-border px-4 text-sm font-semibold text-ink">Open My Arena</Link>
      </div>
    </section>}
  </div>;
}
