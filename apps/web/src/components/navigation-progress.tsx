"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

import { cn } from "@/lib/utils";

const SHOW_DELAY_MS = 150;
const SAFETY_TIMEOUT_MS = 8000;

/**
 * Returns true when a click will be handled by the Next router as an
 * in-app navigation (so a progress bar is warranted).
 */
function isInAppNavigationClick(event: MouseEvent): boolean {
  // This listener runs in the capture phase (see addEventListener below), so
  // `defaultPrevented` here only reflects calls to `preventDefault()` made by
  // other capture-phase listeners higher in the tree that ran before this one
  // — it cannot see a bubble-phase handler on the anchor itself, since those
  // haven't run yet at this point in the dispatch.
  if (event.defaultPrevented || event.button !== 0) return false;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
  const target = event.target as Element | null;
  const anchor = target?.closest("a[href]") as HTMLAnchorElement | null;
  if (!anchor) return false;
  if (anchor.target && anchor.target !== "_self") return false;
  if (anchor.hasAttribute("download")) return false;
  const url = new URL(anchor.href, window.location.href);
  if (url.origin !== window.location.origin) return false;
  if (url.pathname.startsWith("/api/")) return false; // file responses, not router navigations
  const samePage = url.pathname === window.location.pathname && url.search === window.location.search;
  if (samePage) return false; // hash-only or no-op
  return true;
}

/**
 * Thin top bar shown while a route transition is in flight. Link-agnostic:
 * it listens for in-app anchor clicks and popstate, and ends on any
 * pathname/searchParams change. Delayed 150ms so instant navigations never
 * flash. Purely decorative (aria-hidden); loading.tsx carries the a11y state.
 */
export function NavigationProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [visible, setVisible] = useState(false);
  const [progress, setProgress] = useState(0);
  const pending = useRef(false);
  const showTimer = useRef<number | null>(null);
  const safetyTimer = useRef<number | null>(null);

  const finish = useCallback(() => {
    if (!pending.current) return;
    pending.current = false;
    if (showTimer.current) window.clearTimeout(showTimer.current);
    if (safetyTimer.current) window.clearTimeout(safetyTimer.current);
    showTimer.current = null;
    safetyTimer.current = null;
    setProgress(100);
    window.setTimeout(() => {
      setVisible(false);
      setProgress(0);
    }, 200);
  }, []);

  useEffect(() => {
    function start() {
      if (pending.current) return;
      pending.current = true;
      showTimer.current = window.setTimeout(() => {
        setProgress(15);
        setVisible(true);
        window.setTimeout(() => setProgress(80), 20);
      }, SHOW_DELAY_MS);
      safetyTimer.current = window.setTimeout(finish, SAFETY_TIMEOUT_MS);
    }
    function onClick(event: MouseEvent) {
      if (isInAppNavigationClick(event)) start();
    }
    function onPopState() {
      start();
    }
    document.addEventListener("click", onClick, true);
    window.addEventListener("popstate", onPopState);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("popstate", onPopState);
      if (showTimer.current) window.clearTimeout(showTimer.current);
      if (safetyTimer.current) window.clearTimeout(safetyTimer.current);
    };
  }, [finish]);

  // Any route change (link, popstate, router.replace from a filter) ends the bar.
  useEffect(() => {
    finish();
  }, [pathname, searchParams, finish]);

  return (
    <div
      aria-hidden="true"
      className={cn(
        "pointer-events-none fixed inset-x-0 top-0 z-[60] h-0.5 transition-opacity duration-200 motion-reduce:transition-none",
        visible ? "opacity-100" : "opacity-0",
      )}
    >
      <div
        className="h-full bg-primary transition-[width] duration-300 ease-out motion-reduce:transition-none"
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}
