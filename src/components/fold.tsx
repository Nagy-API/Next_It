"use client";

import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import clsx from "clsx";

/** A section the person can fold away; remembered on their device (per key). */
export function Fold({ storageKey, header, count, children }: { storageKey: string; header: React.ReactNode; count?: number; children: React.ReactNode }) {
  const [folded, setFolded] = useState(false);
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFolded(localStorage.getItem(`fold:${storageKey}`) === "1");
    } catch {}
  }, [storageKey]);
  const toggle = () =>
    setFolded((f) => {
      try {
        if (f) localStorage.removeItem(`fold:${storageKey}`);
        else localStorage.setItem(`fold:${storageKey}`, "1");
      } catch {}
      return !f;
    });
  return (
    <div>
      <button type="button" onClick={toggle} aria-expanded={!folded} className="group mb-2.5 flex w-full cursor-pointer items-center gap-2.5 text-left">
        {header}
        {folded && count !== undefined && <span className="text-[12.5px] text-muted">folded</span>}
        <ChevronDown className={clsx("ml-auto size-4 text-faint transition-transform group-hover:text-ink", folded && "-rotate-90")} />
      </button>
      {!folded && children}
    </div>
  );
}
