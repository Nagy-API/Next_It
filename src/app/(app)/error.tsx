"use client";

import { useEffect } from "react";
import Link from "next/link";
import { RefreshCw, LifeBuoy } from "lucide-react";
import { BRAND } from "@/config/brand";

/**
 * If one page fails, only that page shows this — the menu and everything else keep working,
 * and "Try again" reloads just the page. The code (digest) matches the line in the server log.
 */
export default function PageError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="mx-auto mt-10 max-w-[520px] rounded-2xl border border-line bg-white p-8 text-center shadow-card">
      <LifeBuoy className="mx-auto mb-3 size-9 text-electric" />
      <h1 className="font-display text-[20px] font-bold">This page didn&rsquo;t load</h1>
      <p className="mt-2 text-[14px] text-muted">Nothing was lost — your work is saved. Try again, or go back to your tasks.</p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <button type="button" onClick={() => retry()} className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-xl bg-electric px-4 text-[14px] font-semibold text-white hover:bg-[#2f74e8]">
          <RefreshCw className="size-4" /> Try again
        </button>
        <Link href="/my-work" className="inline-flex h-10 items-center rounded-xl border border-line px-4 text-[14px] font-semibold text-ink hover:border-line-strong">
          My tasks
        </Link>
      </div>
      {error.digest && (
        <p className="mt-5 text-[12px] text-faint">
          If it keeps happening, send this code to {BRAND.adminContact}: <code className="rounded bg-canvas px-1.5 py-0.5">{error.digest}</code>
        </p>
      )}
    </div>
  );
}
