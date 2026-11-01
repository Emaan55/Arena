"use client";

import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** Mount outside the blurred header: backdrop-filter contains fixed descendants. */
export function MobileOverlay({ children, label, onClose, desktopQuery = "(min-width: 1280px)" }: {
  children: ReactNode;
  label: string;
  onClose: () => void;
  desktopQuery?: string;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);

  // Unlock during unmount's layout phase, before Next applies route/hash scrolling.
  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const { body, documentElement: html } = document;
    const { scrollX, scrollY } = window;
    const previous = { position: body.style.position, top: body.style.top, left: body.style.left,
      width: body.style.width, overflow: body.style.overflow, paddingRight: body.style.paddingRight,
      htmlOverflow: html.style.overflow, scrollBehavior: html.style.scrollBehavior };
    const scrollbar = window.innerWidth - html.clientWidth;
    const padding = getComputedStyle(body).paddingRight;
    Object.assign(body.style, { position: "fixed", top: `${-scrollY}px`, left: `${-scrollX}px`, width: "100%", overflow: "hidden" });
    if (scrollbar > 0) body.style.paddingRight = `calc(${padding} + ${scrollbar}px)`;
    html.style.overflow = "hidden";

    const focusable = () => Array.from(dialog.querySelectorAll<HTMLElement>(
      'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]',
    )).filter((element) => element.tabIndex >= 0 && element.getClientRects().length > 0);
    (focusable()[0] ?? dialog).focus({ preventScroll: true });
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closeRef.current();
      }
      if (event.key !== "Tab") return;
      const items = focusable();
      const first = items[0], last = items.at(-1);
      if (!first || !last) { event.preventDefault(); dialog?.focus(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first.focus();
      }
    }
    function keepFocus(event: FocusEvent) {
      if (!dialog?.contains(event.target as Node)) (focusable()[0] ?? dialog)?.focus({ preventScroll: true });
    }
    const desktop = window.matchMedia(desktopQuery);
    const closeOnDesktop = () => { if (desktop.matches) closeRef.current(); };
    closeOnDesktop();
    desktop.addEventListener("change", closeOnDesktop);
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("focusin", keepFocus);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("focusin", keepFocus);
      desktop.removeEventListener("change", closeOnDesktop);
      Object.assign(body.style, { position: previous.position, top: previous.top, left: previous.left,
        width: previous.width, overflow: previous.overflow, paddingRight: previous.paddingRight });
      html.style.overflow = previous.htmlOverflow;
      html.style.scrollBehavior = "auto";
      window.scrollTo({ left: scrollX, top: scrollY, behavior: "instant" });
      html.style.scrollBehavior = previous.scrollBehavior;
      if (trigger?.isConnected && trigger.getClientRects().length) trigger.focus({ preventScroll: true });
    };
  }, [desktopQuery]);

  return createPortal(
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1}
      className="fixed inset-0 z-[100] h-dvh max-h-dvh outline-none">
      {children}
    </div>, document.body,
  );
}
