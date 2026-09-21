"use client";

import { useEffect, useState } from "react";

const SECRET_STORAGE_KEY = "arena_admin_secret";

/** Shared founder-secret gate — same sessionStorage key as /admin/sponsorships and /admin/favicon-diagnostic. */
export function useAdminSecret() {
  const [secret, setSecret] = useState<string | null>(null);

  useEffect(() => {
    try {
      const saved = window.sessionStorage.getItem(SECRET_STORAGE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved) setSecret(saved);
    } catch {
      // sessionStorage unavailable — fall back to the entry form.
    }
  }, []);

  function unlock(value: string) {
    try {
      window.sessionStorage.setItem(SECRET_STORAGE_KEY, value);
    } catch {}
    setSecret(value);
  }

  function reject() {
    setSecret(null);
    try {
      window.sessionStorage.removeItem(SECRET_STORAGE_KEY);
    } catch {}
  }

  return { secret, unlock, reject };
}
