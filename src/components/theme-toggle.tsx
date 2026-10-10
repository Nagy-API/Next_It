"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import { Moon, Sun } from "lucide-react";

/** Light / dark, remembered on this device (a cookie the server reads, so the page never flashes). */
export function ThemeToggle({ className }: { className?: string }) {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDark(document.documentElement.classList.contains("dark"));
  }, []);
  const flip = () => {
    const next = !dark;
    setDark(next);
    const root = document.documentElement;
    // A short cross-fade instead of a hard cut.
    root.classList.add("theme-fade");
    root.classList.toggle("dark", next);
    window.setTimeout(() => root.classList.remove("theme-fade"), 350);
    document.cookie = `theme=${next ? "dark" : "light"}; path=/; max-age=31536000; samesite=lax`;
  };
  return (
    <button
      type="button"
      onClick={flip}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      title={dark ? "Light mode" : "Dark mode"}
      className={clsx("relative grid size-10 cursor-pointer place-items-center overflow-hidden rounded-xl border border-line bg-surface text-ink-2 transition-colors hover:border-line-strong hover:text-ink", className)}
    >
      <Sun className={clsx("absolute size-[18px] transition-all duration-300", dark ? "rotate-90 scale-0 opacity-0" : "rotate-0 scale-100 opacity-100")} />
      <Moon className={clsx("absolute size-[18px] transition-all duration-300", dark ? "rotate-0 scale-100 opacity-100" : "-rotate-90 scale-0 opacity-0")} />
    </button>
  );
}
