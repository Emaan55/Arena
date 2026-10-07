"use client";

import { useEffect, useState } from "react";
import { ArenaLoader } from "./ArenaLoader";

/** One splash per document load; route Suspense uses the same loader separately. */
export function InitialArenaSplash() {
  const [phase, setPhase] = useState<"visible" | "leaving" | "done">("visible");
  useEffect(() => {
    let finishTimer: ReturnType<typeof setTimeout>;
    // Count from navigation start, so a slow page never waits an extra delay.
    // Do not wait for analytics, payment scripts, or external image downloads.
    const startTimer = setTimeout(() => {
      setPhase("leaving");
      finishTimer = setTimeout(() => setPhase("done"), window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 180);
    }, Math.max(0, 450 - performance.now()));
    return () => { clearTimeout(startTimer); clearTimeout(finishTimer); };
  }, []);

  if (phase === "done") return null;
  return <>
    <div className={`arena-initial-splash ${phase === "leaving" ? "arena-initial-splash-leaving" : ""}`}><ArenaLoader splash /></div>
    <noscript><style>{".arena-initial-splash{display:none!important}"}</style></noscript>
  </>;
}
