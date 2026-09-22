"use client";

import { useState } from "react";
import { Eye, EyeOff, type LucideIcon } from "lucide-react";

/** Labeled input with a leading icon, matching the reference mockup's input style. */
export function AuthInput({
  icon: Icon,
  label,
  error,
  type = "text",
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { icon: LucideIcon; label: string; error?: string }) {
  const [show, setShow] = useState(false);
  const isPassword = type === "password";
  const effectiveType = isPassword ? (show ? "text" : "password") : type;

  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold text-ink">{label}</span>
      <div className="relative">
        <Icon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <input
          {...props}
          type={effectiveType}
          className={`w-full rounded-lg border bg-bg py-2.5 pl-10 text-sm text-ink placeholder:text-muted focus:outline-none ${
            isPassword ? "pr-10" : "pr-3"
          } ${error ? "border-danger focus:border-danger" : "border-border focus:border-accent"}`}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            tabIndex={-1}
            aria-label={show ? "Hide password" : "Show password"}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted transition-colors duration-150 ease-out hover:text-ink"
          >
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        )}
      </div>
      {error && <span className="text-xs text-danger">{error}</span>}
    </label>
  );
}
