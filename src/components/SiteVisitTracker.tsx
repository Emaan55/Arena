"use client";

import { useEffect } from "react";

export function SiteVisitTracker() {
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/analytics/site", { method: "POST", signal: controller.signal, keepalive: true }).catch(() => {});
    return () => controller.abort();
  }, []);
  return null;
}

