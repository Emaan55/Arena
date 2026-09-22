"use client";

import { ArrowRight, Check, Loader2 } from "lucide-react";
import { checkPassword } from "@/lib/auth/config";

export function AuthButton({
  loading,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean }) {
  return (
    <button
      {...props}
      disabled={loading || props.disabled}
      className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-accent-ink shadow-sm transition-all duration-150 ease-out hover:-translate-y-0.5 hover:shadow-md active:scale-95 disabled:pointer-events-none disabled:opacity-60"
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      {children}
      {!loading && <ArrowRight className="h-4 w-4" />}
    </button>
  );
}

export function PasswordChecklist({ password }: { password: string }) {
  const c = checkPassword(password);
  const rows: Array<[boolean, string]> = [
    [c.minLength, "At least 8 characters"],
    [c.hasUppercase, "One uppercase letter"],
    [c.hasNumber, "One number"],
  ];
  return (
    <ul className="flex flex-col gap-1">
      {rows.map(([ok, label]) => (
        <li key={label} className={`flex items-center gap-1.5 text-xs ${ok ? "text-accent" : "text-muted"}`}>
          {ok ? <Check className="h-3.5 w-3.5" /> : <span className="h-3.5 w-3.5 rounded-full border border-current" />}
          {label}
        </li>
      ))}
    </ul>
  );
}
