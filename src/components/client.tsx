"use client";

import { createContext, useActionState, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useFormStatus } from "react-dom";
import clsx from "clsx";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import type { ActionResult } from "@/app/actions";
import { btn, type BtnVariant } from "./ui";
import { celebrate } from "./celebrate";

/* ------------------------------------------------------------------ */
/* Toasts                                                               */
/* ------------------------------------------------------------------ */

type Toast = { id: number; kind: "ok" | "error"; text: string };
const ToastCtx = createContext<(t: Omit<Toast, "id">) => void>(() => {});

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((t: Omit<Toast, "id">) => {
    const id = Date.now() + Math.random();
    setToasts((all) => [...all.slice(-3), { ...t, id }]);
    setTimeout(() => setToasts((all) => all.filter((x) => x.id !== id)), t.kind === "error" ? 6000 : 3200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed bottom-24 left-1/2 lg:bottom-5 z-[100] flex -translate-x-1/2 flex-col items-center gap-2" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={clsx(
              "pointer-events-auto flex max-w-[92vw] animate-in items-center gap-2 rounded-xl px-4 py-2.5 text-[14px] font-medium shadow-pop",
              t.kind === "ok" ? "bg-strong text-white" : "bg-bad text-white",
            )}
          >
            {t.kind === "ok" ? <CheckCircle2 className="size-4 text-emerald-300" /> : <XCircle className="size-4" />}
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);

/* ------------------------------------------------------------------ */
/* Forms wired to server actions                                        */
/* ------------------------------------------------------------------ */

type ServerAction = (prev: ActionResult, fd: FormData) => Promise<ActionResult>;

export function ActionForm({
  action,
  children,
  className,
  onSuccess,
  resetOnSuccess,
  toast = true,
  inlineError = true,
  id,
}: {
  action: ServerAction;
  children: React.ReactNode;
  className?: string;
  onSuccess?: (r: Extract<ActionResult, { ok: true }>) => void;
  resetOnSuccess?: boolean;
  toast?: boolean;
  inlineError?: boolean;
  id?: string;
}) {
  const push = useToast();
  const ref = useRef<HTMLFormElement>(null);
  const opts = useRef({ onSuccess, toast, resetOnSuccess, inlineError });
  useEffect(() => {
    opts.current = { onSuccess, toast, resetOnSuccess, inlineError };
  });
  // Feedback is given as soon as the action resolves — the form itself may already be gone
  // (e.g. the stage it belonged to just completed), but the toast provider is not.
  const [state, formAction] = useActionState(async (prev: ActionResult, fd: FormData) => {
    const r = await action(prev, fd);
    const o = opts.current;
    if (r?.ok) {
      if (o.toast && r.message) push({ kind: "ok", text: r.message });
      if (r.celebrate) celebrate(r.celebrate);
      if (o.resetOnSuccess) ref.current?.reset();
      o.onSuccess?.(r);
    } else if (r && !o.inlineError) {
      push({ kind: "error", text: r.error });
    }
    return r;
  }, null);
  return (
    <form ref={ref} action={formAction} className={className} id={id}>
      {children}
      {inlineError && state && !state.ok && (
        <p role="alert" className="mt-2 flex items-start gap-1.5 text-[13px] font-medium text-bad">
          <XCircle className="mt-0.5 size-3.5 shrink-0" />
          {state.error}
        </p>
      )}
    </form>
  );
}

export function Submit({
  children,
  variant = "primary",
  size = "md",
  className,
  name,
  value,
  disabled,
  title,
}: {
  children: React.ReactNode;
  variant?: BtnVariant;
  size?: "sm" | "md" | "lg";
  className?: string;
  name?: string;
  value?: string;
  disabled?: boolean;
  title?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" name={name} value={value} disabled={pending || disabled} title={title} className={btn(variant, size, className)}>
      {pending && <Loader2 className="size-4 animate-spin" />}
      {children}
    </button>
  );
}

/** A select that saves as soon as it changes (inside an ActionForm). */
export function AutoSelect({ className, children, ...props }: React.ComponentProps<"select">) {
  const { pending } = useFormStatus();
  return (
    <select
      {...props}
      disabled={pending || props.disabled}
      className={clsx("field field-sm cursor-pointer pr-7", className)}
      onChange={(e) => {
        props.onChange?.(e);
        e.currentTarget.form?.requestSubmit();
      }}
    >
      {children}
    </select>
  );
}

/** A date/time input that saves when it changes. */
export function AutoInput({ className, ...props }: React.ComponentProps<"input">) {
  const { pending } = useFormStatus();
  return (
    <input
      {...props}
      disabled={pending || props.disabled}
      className={clsx("field field-sm", className)}
      onChange={(e) => {
        props.onChange?.(e);
        if (props.type === "date" || props.type === "time") e.currentTarget.form?.requestSubmit();
      }}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Popover                                                                */
/* ------------------------------------------------------------------ */

export function Popover({
  trigger,
  children,
  align = "left",
  className,
  triggerClassName,
  width = 300,
  label,
}: {
  trigger: React.ReactNode;
  children: (close: () => void) => React.ReactNode;
  align?: "left" | "right";
  className?: string;
  triggerClassName?: string;
  width?: number;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // The panel floats above the page (portal + fixed position), so a card or table edge can never cut it off.
  const place = useCallback(() => {
    const b = btnRef.current?.getBoundingClientRect();
    if (!b) return;
    const w = Math.min(width, window.innerWidth - 16);
    let left = align === "right" ? b.right - w : b.left;
    left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
    const h = panelRef.current?.offsetHeight ?? 0;
    let top = b.bottom + 6;
    if (h && top + h > window.innerHeight - 8 && b.top - h - 6 >= 8) top = b.top - h - 6;
    setPos({ top, left });
  }, [align, width]);

  useLayoutEffect(() => {
    if (!open) return;
    place();
    const raf = requestAnimationFrame(place); // again once the panel has its height
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!btnRef.current?.contains(t) && !panelRef.current?.contains(t)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className={clsx("relative inline-block", className)}>
      <button ref={btnRef} type="button" aria-label={label} aria-expanded={open} onClick={() => setOpen((o) => !o)} className={triggerClassName}>
        {trigger}
      </button>
      {open &&
        createPortal(
          <div
            ref={panelRef}
            className="fixed z-[90] animate-in rounded-xl border border-line bg-surface p-3 text-ink shadow-pop"
            style={{ width: Math.min(width, typeof window === "undefined" ? width : window.innerWidth - 16), top: pos?.top ?? -9999, left: pos?.left ?? -9999 }}
          >
            {children(() => setOpen(false))}
          </div>,
          document.body,
        )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Modal (centered, never clipped by its parent)                         */
/* ------------------------------------------------------------------ */

export function Modal({ open, onClose, title, children, width = 440 }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; width?: number }) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-navy-950/40 p-4 pt-[10vh]"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="card mb-10 w-full animate-in p-5 text-ink shadow-pop" style={{ maxWidth: width }}>
        <div className="mb-4 font-display text-[17px] font-bold">{title}</div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
