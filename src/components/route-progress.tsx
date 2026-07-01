"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

const MIN_VISIBLE_MS = 400;

function isModifiedEvent(event: MouseEvent): boolean {
  return (
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey ||
    event.button !== 0
  );
}

export function RouteProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [visible, setVisible] = useState(false);
  const [progress, setProgress] = useState(0);

  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const startedAt = useRef<number | null>(null);
  const active = useRef(false);

  const clearTimers = useCallback(() => {
    timers.current.forEach((t) => clearTimeout(t));
    timers.current = [];
  }, []);

  const pushTimer = useCallback((fn: () => void, ms: number) => {
    timers.current.push(setTimeout(fn, ms));
  }, []);

  const begin = useCallback(() => {
    clearTimers();
    active.current = true;
    startedAt.current = Date.now();
    setVisible(true);
    setProgress(10);
    pushTimer(() => setProgress(40), 100);
    pushTimer(() => setProgress(65), 300);
    pushTimer(() => setProgress(85), 700);
  }, [clearTimers, pushTimer]);

  const finish = useCallback(() => {
    if (!active.current) return;
    const elapsed = startedAt.current ? Date.now() - startedAt.current : 0;
    const wait = Math.max(0, MIN_VISIBLE_MS - elapsed);
    clearTimers();
    pushTimer(() => {
      setProgress(100);
      pushTimer(() => {
        setVisible(false);
        active.current = false;
        pushTimer(() => setProgress(0), 200);
      }, 200);
    }, wait);
  }, [clearTimers, pushTimer]);

  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (isModifiedEvent(event)) return;

      const anchor = (event.target as HTMLElement | null)?.closest("a");
      if (!anchor) return;

      const href = anchor.getAttribute("href");
      if (
        !href ||
        anchor.target === "_blank" ||
        anchor.hasAttribute("download") ||
        href.startsWith("#") ||
        href.startsWith("mailto:") ||
        href.startsWith("tel:")
      ) {
        return;
      }

      const destination = new URL(anchor.href, window.location.href);
      if (destination.origin !== window.location.origin) return;

      const current = window.location.pathname + window.location.search;
      const next = destination.pathname + destination.search;
      if (current === next) return;

      begin();
    }

    document.addEventListener("click", onClick, { capture: true });
    window.addEventListener("popstate", begin);
    return () => {
      document.removeEventListener("click", onClick, { capture: true });
      window.removeEventListener("popstate", begin);
      clearTimers();
    };
  }, [begin, clearTimers]);

  useEffect(() => {
    finish();
  }, [pathname, searchParams, finish]);

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-0.5"
    >
      <div
        className="h-full bg-primary shadow-[0_0_8px_var(--primary)] transition-[width,opacity] duration-200 ease-out"
        style={{
          width: `${progress}%`,
          opacity: visible ? 1 : 0,
        }}
      />
    </div>
  );
}
