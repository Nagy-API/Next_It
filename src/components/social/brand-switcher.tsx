"use client";

import { usePathname, useRouter } from "next/navigation";
import clsx from "clsx";
import { Check, ChevronDown, LayoutGrid } from "lucide-react";
import { SOCIAL_BRAND_COOKIE } from "@/domain/social";
import { Popover } from "../client";
import { BrandMark } from "../ui";

export type SwitcherBrand = { id: string; name: string; slug?: string; color: string; logoUrl?: string | null; connected: boolean };

const NOT_CONNECTED = "Connect with Facebook first";

/** A brand's mark and name; grey, with "Connect with Facebook first", while it has no connected account. */
function BrandRow({ b, right }: { b: SwitcherBrand; right?: React.ReactNode }) {
  return (
    <>
      <span className={clsx("shrink-0", !b.connected && "opacity-45 grayscale")}>
        <BrandMark name={b.name} color={b.color} logoUrl={b.logoUrl} size={24} />
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span className={clsx("block truncate", !b.connected && "text-faint")}>{b.name}</span>
        {!b.connected && <span className="block truncate text-[11.5px] font-normal text-muted">{NOT_CONNECTED}</span>}
      </span>
      {right}
    </>
  );
}

const rowClass = (active: boolean, disabled?: boolean) =>
  clsx("flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[14px]", active ? "bg-electric-soft font-semibold text-ink" : "text-ink-2", disabled ? "cursor-not-allowed" : !active && "hover:bg-hover");

/** Kept in a cookie so the server renders the right brand on every tab (and next time). */
function remember(slug: string) {
  document.cookie = `${SOCIAL_BRAND_COOKIE}=${encodeURIComponent(slug)}; path=/; max-age=31536000; samesite=lax`;
}

/**
 * Whose schedule is on screen. Pick a brand and the Calendar, the Media library and the Analytics all switch to
 * it (remembered on this device); "All brands" shows everything together. A brand without a connected account
 * is grey — choosing it shows its screens blurred with a "connect first" card.
 */
export function BrandSwitcher({ brands, current }: { brands: SwitcherBrand[]; current: string }) {
  const router = useRouter();
  const pathname = usePathname();
  // Configuration is about channels, not about one brand's schedule.
  if (pathname.startsWith("/social/config")) return null;
  const now = brands.find((b) => b.slug === current) ?? null;
  const pick = (slug: string, close: () => void) => {
    remember(slug);
    close();
    router.refresh();
  };
  const all = (
    <span className="flex size-6 items-center justify-center rounded-md bg-sunken text-ink-2">
      <LayoutGrid className="size-3.5" />
    </span>
  );
  return (
    <Popover
      align="right"
      width={280}
      label="Choose a brand"
      triggerClassName="inline-flex h-10 min-w-[200px] items-center gap-2.5 rounded-xl border border-line bg-surface pl-2.5 pr-3 text-[14px] font-semibold text-ink shadow-card hover:border-line-strong"
      trigger={
        <>
          {now ? <span className={clsx("shrink-0", !now.connected && "opacity-45 grayscale")}><BrandMark name={now.name} color={now.color} logoUrl={now.logoUrl} size={24} /></span> : all}
          <span className={clsx("min-w-0 flex-1 truncate text-left", now && !now.connected && "text-muted")}>{now?.name ?? "All brands"}</span>
          <ChevronDown className="size-4 shrink-0 text-muted" />
        </>
      }
    >
      {(close) => (
        <div className="-m-1.5 max-h-[60vh] overflow-y-auto">
          <div className="px-2.5 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">Schedule of</div>
          <button type="button" className={rowClass(!now)} onClick={() => pick("", close)}>
            {all}
            <span className="flex-1">All brands</span>
            {!now && <Check className="size-4 text-electric" />}
          </button>
          {brands.map((b) => (
            <button key={b.id} type="button" className={rowClass(now?.id === b.id)} onClick={() => pick(b.slug ?? "", close)}>
              <BrandRow b={b} right={now?.id === b.id && <Check className="size-4 shrink-0 text-electric" />} />
            </button>
          ))}
        </div>
      )}
    </Popover>
  );
}

/**
 * Inside the composer: the brand a post belongs to. One brand must be chosen (there is no "all brands" here), and
 * only a connected one can be — the others are grey with "Connect with Facebook first".
 */
export function BrandSelect({ brands, value, onChange, id }: { brands: SwitcherBrand[]; value: string | null; onChange: (id: string) => void; id?: string }) {
  const now = brands.find((b) => b.id === value) ?? null;
  return (
    <Popover
      width={320}
      label="Brand"
      className="w-full"
      triggerClassName={clsx("field flex items-center gap-2.5 text-left", !now && "border-electric ring-3 ring-electric/15")}
      trigger={
        <>
          {now ? <BrandMark name={now.name} color={now.color} logoUrl={now.logoUrl} size={22} /> : <span className="size-[22px] rounded-md border border-dashed border-line-strong" />}
          <span id={id} className={clsx("min-w-0 flex-1 truncate", now ? "font-medium" : "text-muted")}>
            {now?.name ?? "Choose the brand first…"}
          </span>
          <ChevronDown className="size-4 shrink-0 text-muted" />
        </>
      }
    >
      {(close) => (
        <div className="-m-1.5 max-h-[50vh] overflow-y-auto">
          {brands.map((b) => (
            <button
              key={b.id}
              type="button"
              disabled={!b.connected}
              aria-disabled={!b.connected}
              title={b.connected ? undefined : `${b.name} has no connected account. Connect its Facebook Page in Configuration first.`}
              className={rowClass(value === b.id, !b.connected)}
              onClick={() => {
                onChange(b.id);
                close();
              }}
            >
              <BrandRow b={b} right={value === b.id && <Check className="size-4 shrink-0 text-electric" />} />
            </button>
          ))}
          {!brands.some((b) => b.connected) && <p className="px-2.5 py-2 text-[12.5px] text-muted">No brand is connected yet. Connect a Facebook Page in the Configuration tab.</p>}
        </div>
      )}
    </Popover>
  );
}
