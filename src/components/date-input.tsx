"use client";

import { useEffect, useId, useRef, useState } from "react";
import clsx from "clsx";
import { useFormStatus } from "react-dom";

/**
 * A date field that always reads day first: 09/10/2026. Type the digits (the slashes come by themselves)
 * or tap the calendar. The form still receives "2026-10-09" under `name`, so servers don't change.
 */
type Props = {
  name?: string;
  /** Controlled value (YYYY-MM-DD or ""). */
  value?: string;
  defaultValue?: string | null;
  onChange?: (iso: string) => void;
  required?: boolean;
  min?: string;
  max?: string;
  disabled?: boolean;
  id?: string;
  className?: string;
  /** Submits the surrounding form as soon as a full date is picked or the field is cleared. */
  autoSubmit?: boolean;
  /** Light text on a dark bar. */
  dark?: boolean;
  size?: "sm" | "md";
  "aria-label"?: string;
};

export function isoToDmy(iso: string | null | undefined) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "";
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

/** "9/10/2026", "09102026", "9-10-26" → "2026-10-09"; "" when it isn't a real day. */
export function dmyToIso(text: string): string {
  const t = text.trim();
  let d: number, m: number, y: number;
  const parts = t.split(/[/.\-\s]+/).filter(Boolean);
  if (parts.length === 3) [d, m, y] = parts.map(Number);
  else if (/^\d{8}$/.test(t)) [d, m, y] = [Number(t.slice(0, 2)), Number(t.slice(2, 4)), Number(t.slice(4))];
  else if (/^\d{6}$/.test(t)) [d, m, y] = [Number(t.slice(0, 2)), Number(t.slice(2, 4)), Number(t.slice(4))];
  else return "";
  if (y < 100) y += 2000;
  if (!d || !m || !y || m > 12 || d > 31 || y < 2000 || y > 2199) return "";
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) return "";
  return dt.toISOString().slice(0, 10);
}

/** While typing digits: 0910 → 09/10, 09102026 → 09/10/2026. */
function mask(raw: string) {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

export function DateInput({
  name,
  value,
  defaultValue,
  onChange,
  required,
  min,
  max,
  disabled,
  id,
  className,
  autoSubmit,
  dark,
  size = "md",
  "aria-label": ariaLabel,
}: Props) {
  const controlled = value !== undefined;
  const [inner, setInner] = useState(defaultValue ?? "");
  const iso = controlled ? value : inner;
  const [text, setText] = useState(isoToDmy(iso));
  const textRef = useRef<HTMLInputElement>(null);
  const hiddenRef = useRef<HTMLInputElement>(null);
  const pickerRef = useRef<HTMLInputElement>(null);
  const { pending } = useFormStatus();
  const auto = useId();

  // Follow outside changes (a controlled value set by the parent).
  useEffect(() => {
    if (controlled && dmyToIso(text) !== value) setText(isoToDmy(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const validity = (next: string, typed: string) => {
    const el = textRef.current;
    if (!el) return;
    if (typed && !next) el.setCustomValidity("Write the date as day/month/year, e.g. 09/10/2026.");
    else if (next && min && next < min) el.setCustomValidity(`Pick ${isoToDmy(min)} or later.`);
    else if (next && max && next > max) el.setCustomValidity(`Pick ${isoToDmy(max)} or earlier.`);
    else el.setCustomValidity("");
  };

  const commit = (next: string) => {
    if (!controlled) setInner(next);
    if (hiddenRef.current) hiddenRef.current.value = next;
    if (next !== iso) {
      onChange?.(next);
      if (autoSubmit) hiddenRef.current?.form?.requestSubmit();
    }
  };

  const onType = (raw: string) => {
    const masked = mask(raw);
    setText(masked);
    const next = dmyToIso(masked);
    validity(next, masked);
    if (next) commit(next);
    else if (!masked) commit("");
  };

  const openPicker = () => {
    const p = pickerRef.current;
    if (!p) return;
    try {
      p.showPicker();
    } catch {
      p.focus();
      p.click();
    }
  };

  const off = disabled || pending;
  return (
    <span className={clsx("relative inline-flex items-center", className)}>
      <input
        ref={textRef}
        id={id ?? auto}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder="dd/mm/yyyy"
        value={text}
        onChange={(e) => onType(e.target.value)}
        onBlur={() => {
          const next = dmyToIso(text);
          if (next) setText(isoToDmy(next));
        }}
        required={required}
        disabled={off}
        aria-label={ariaLabel}
        className={clsx(
          dark ? "h-8 rounded-md border-0 bg-white/10 pl-2 text-[13px] text-white placeholder:text-white/50" : clsx("field tabular-nums", size === "sm" && "field-sm"),
          "w-full min-w-[124px] pr-9",
        )}
      />
      <button
        type="button"
        onClick={openPicker}
        disabled={off}
        aria-label="Open calendar"
        className={clsx(
          "absolute right-1 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-md transition-colors",
          dark ? "text-white/70 hover:bg-white/10" : "text-faint hover:bg-canvas hover:text-ink",
        )}
      >
        <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
          <rect x="3" y="4.5" width="14" height="12" rx="2.5" />
          <path d="M3 8.5h14M7 2.75v3M13 2.75v3" strokeLinecap="round" />
        </svg>
      </button>
      {/* The phone's own calendar; invisible, opened by the button above. */}
      <input
        ref={pickerRef}
        type="date"
        tabIndex={-1}
        aria-hidden
        value={iso || ""}
        min={min}
        max={max}
        onChange={(e) => {
          const next = e.target.value;
          setText(isoToDmy(next));
          validity(next, next);
          commit(next);
        }}
        className="pointer-events-none absolute bottom-0 right-0 h-px w-px opacity-0"
      />
      {name && <input ref={hiddenRef} type="hidden" name={name} value={iso || ""} />}
    </span>
  );
}
