"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

/**
 * Supabase's password-reset emails go through its own /auth/v1/verify
 * endpoint first, which only honors a custom redirectTo when it exactly
 * matches an entry in the project's Redirect URLs allow-list — otherwise it
 * silently falls back to the bare Site URL, dropping the path and query
 * entirely. That means a recovery link can land on any page (typically the
 * homepage) instead of /auth/reset-password, regardless of what this app
 * requests. Supabase's client still fires a distinct PASSWORD_RECOVERY auth
 * event wherever the token actually gets consumed, so catching it here —
 * mounted once, globally, in the root layout — is what gets the visitor to
 * the reset-password form no matter which page the link dropped them on.
 */
export function PasswordRecoveryRedirect() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" && pathname !== "/auth/reset-password") {
        router.replace("/auth/reset-password");
      }
    });
    return () => subscription.unsubscribe();
  }, [pathname, router]);

  return null;
}
