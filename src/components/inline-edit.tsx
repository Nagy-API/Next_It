"use client";

import { useState } from "react";
import clsx from "clsx";
import { Check, Pencil, X } from "lucide-react";
import { updateItemAction } from "@/app/actions";
import { ActionForm, Popover, Submit } from "./client";
import { DateInput } from "./date-input";
import { btn } from "./ui";

/**
 * Change a title right where it is: hover → pencil (or press Enter on it) → type → Enter saves, Esc cancels.
 * `children` is the normal (linked) title shown when not editing.
 */
export function InlineTitle({
  value,
  fields,
  action = updateItemAction,
  name = "title",
  children,
  className,
  inputClassName,
  label = "Rename",
}: {
  value: string;
  fields: Record<string, string>;
  action?: typeof updateItemAction;
  name?: string;
  children: React.ReactNode;
  className?: string;
  inputClassName?: string;
  label?: string;
}) {
  const [editing, setEditing] = useState(false);
  if (editing)
    return (
      <ActionForm action={action} onSuccess={() => setEditing(false)} className={clsx("relative z-20 flex min-w-0 flex-1 items-center gap-1.5", className)}>
        {Object.entries(fields).map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
        <input
          name={name}
          defaultValue={value}
          autoFocus
          required
          maxLength={200}
          onFocus={(e) => e.currentTarget.select()}
          onKeyDown={(e) => e.key === "Escape" && setEditing(false)}
          className={clsx("field field-sm min-w-0 flex-1", inputClassName)}
          aria-label={label}
        />
        <Submit size="sm" className="!px-2" title="Save">
          <Check className="size-4" />
        </Submit>
        <button type="button" onClick={() => setEditing(false)} className={btn("ghost", "sm", "!px-2")} aria-label="Cancel">
          <X className="size-4" />
        </button>
      </ActionForm>
    );
  return (
    <span className={clsx("group/edit flex min-w-0 items-center gap-1", className)}>
      {children}
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setEditing(true);
        }}
        onDoubleClick={(e) => e.stopPropagation()}
        className="relative z-10 grid size-7 shrink-0 cursor-pointer place-items-center rounded-md text-faint opacity-0 transition hover:bg-sunken hover:text-ink focus-visible:opacity-100 group-hover:opacity-100 max-sm:opacity-100"
        aria-label={label}
        title={label}
      >
        <Pencil className="size-3.5" />
      </button>
    </span>
  );
}

/** Click the date box → pick a new posting date → saved. */
export function InlineDate({ itemId, value, children, className }: { itemId: string; value: string | null; children: React.ReactNode; className?: string }) {
  return (
    <Popover
      label="Change the posting date"
      width={280}
      className={clsx("relative z-10", className)}
      triggerClassName="block w-full cursor-pointer rounded-xl transition hover:ring-2 hover:ring-electric/40"
      trigger={children}
    >
      {(close) => (
        <ActionForm action={updateItemAction} onSuccess={close}>
          <input type="hidden" name="itemId" value={itemId} />
          <div className="text-[13px] font-semibold">Posting date</div>
          <div className="mt-0.5 text-[12px] text-muted">The item moves to that month&rsquo;s plan if the month changes.</div>
          <DateInput name="postingDate" defaultValue={value ?? ""} className="mt-2 w-full" aria-label="Posting date" />
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" onClick={close} className={btn("ghost", "sm")}>
              Cancel
            </button>
            <Submit size="sm">Save</Submit>
          </div>
        </ActionForm>
      )}
    </Popover>
  );
}
