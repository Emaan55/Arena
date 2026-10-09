"use client";
import { useEffect } from "react";
export function ProductViewTracker({ productId }: { productId: string }) {
  useEffect(() => {
    try {
      const key = `arena-page-view:${productId}`;
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch { /* Tracking is best-effort when storage is unavailable. */ }
    fetch("/api/analytics", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productId, type: "view" }), keepalive: true }).catch(() => {});
  }, [productId]);
  return null;
}
