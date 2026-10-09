"use client";

import { useEffect, useState } from "react";

const SECRET_STORAGE_KEY = "arena_admin_secret";
const SECRET_CHANGE_EVENT = "arena-admin-secret-change";

/** Shared founder-secret gate — same sessionStorage key as /admin/sponsorships and /admin/favicon-diagnostic. */
export function useAdminSecret() {
  const [secret, setSecret] = useState<string | null>(null);

  useEffect(() => {
    function syncSecret(event: Event) {
      setSecret((event as CustomEvent<string | null>).detail);
    }

    try {
      const saved = window.sessionStorage.getItem(SECRET_STORAGE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved) setSecret(saved);
    } catch {
      // sessionStorage unavailable — fall back to the entry form.
    }
    window.addEventListener(SECRET_CHANGE_EVENT, syncSecret);
    return () => window.removeEventListener(SECRET_CHANGE_EVENT, syncSecret);
  }, []);

  function unlock(value: string) {
    try {
      window.sessionStorage.setItem(SECRET_STORAGE_KEY, value);
    } catch {}
    setSecret(value);
    window.dispatchEvent(new CustomEvent(SECRET_CHANGE_EVENT, { detail: value }));
  }

  function reject() {
    setSecret(null);
    try {
      window.sessionStorage.removeItem(SECRET_STORAGE_KEY);
    } catch {}
    window.dispatchEvent(new CustomEvent(SECRET_CHANGE_EVENT, { detail: null }));
  }

  return { secret, unlock, reject };
}

