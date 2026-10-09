"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * Like a video that resumes where you stopped: every page remembers how far you scrolled, and when you come back
 * to it (Back button, a "← Brand" link, the menu…) it opens at the same place instead of the top.
 * Positions live in sessionStorage (this tab only) for 3 hours. Links to a #section still jump to that section.
 */
const KEY = "nexora:scroll:";
const KEEP_MS = 3 * 60 * 60 * 1000;

function read(key: string): number | null {
  try {
    const raw = sessionStorage.getItem(KEY + key);
    if (!raw) return null;
    const { y, t } = JSON.parse(raw) as { y: number; t: number };
    return Date.now() - t < KEEP_MS && y > 0 ? y : null;
  } catch {
    return null;
  }
}

function write(key: string, y: number) {
  try {
    sessionStorage.setItem(KEY + key, JSON.stringify({ y: Math.round(y), t: Date.now() }));
  } catch {
    /* storage off or full: nothing to remember, the page still works */
  }
}

export function ScrollMemory() {
  const pathname = usePathname();
  const search = useSearchParams();
  const key = `${pathname}?${search.toString()}`;
  const current = useRef(key);

  // Save while scrolling (once per frame at most).
  useEffect(() => {
    current.current = key;
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        write(current.current, window.scrollY);
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [key]);

  // Coming back to a page: put it back where it was (content may still be streaming in, so retry briefly).
  useEffect(() => {
    if (window.location.hash) return;
    const y = read(key);
    if (y === null) return;
    let tries = 0;
    let id = 0;
    const restore = () => {
      const reachable = document.documentElement.scrollHeight - window.innerHeight >= y - 4;
      if (reachable) window.scrollTo({ top: y, behavior: "instant" as ScrollBehavior });
      if ((!reachable || Math.abs(window.scrollY - y) > 4) && tries++ < 40) id = requestAnimationFrame(restore);
    };
    id = requestAnimationFrame(restore);
    // If the person starts scrolling themselves, stop fighting them.
    const stop = () => cancelAnimationFrame(id);
    window.addEventListener("wheel", stop, { once: true, passive: true });
    window.addEventListener("touchstart", stop, { once: true, passive: true });
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener("wheel", stop);
      window.removeEventListener("touchstart", stop);
    };
  }, [key]);

  return null;
}
