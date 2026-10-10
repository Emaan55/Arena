"use client";

import { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";

const STORAGE_KEY = "arena_theme";

function applyFavicon(theme: "light" | "dark") {
  const icon32 = document.getElementById("favicon-32") as HTMLLinkElement | null;
  const icon512 = document.getElementById("favicon-512") as HTMLLinkElement | null;
  if (icon32) icon32.href = `/favicons/icon-${theme}-32.png`;
  if (icon512) icon512.href = `/favicons/icon-${theme}-512.png`;
}

export function ThemeToggle({ className, showLabel = false }: { className?: string; showLabel?: boolean }) {
  // Default matches the CSS default (light) so the very first client
  // render before this effect runs matches the server-rendered markup —
  // the effect below corrects it to the real resolved theme immediately
  // after mount, same pattern used for localStorage-derived state elsewhere
  // in this app.
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    const resolved =
      stored === "light" || stored === "dark"
        ? stored
        : window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light";
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTheme(resolved);
    applyFavicon(resolved);
  }, []);

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem(STORAGE_KEY, next);
    applyFavicon(next);
  }

  return (
    <button
      onClick={toggle}
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
      title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
      className={
        className ??
        `flex h-9 items-center justify-center gap-2 rounded-lg border border-border bg-surface text-ink transition-all duration-150 ease-out hover:border-accent active:scale-90 ${showLabel ? "px-2.5" : "w-9"}`
      }
    >
      {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      {showLabel && <span className="hidden text-xs font-bold min-[1600px]:inline">{theme === "dark" ? "Light" : "Dark"}</span>}
    </button>
  );
}

