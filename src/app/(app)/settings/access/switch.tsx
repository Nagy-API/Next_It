"use client";

import clsx from "clsx";
import { RotateCcw } from "lucide-react";
import { resetAccessAction, setPermissionAction } from "@/app/actions";
import { ActionForm } from "@/components/client";

/** On / off for one permission. Going back to the default removes the change instead of storing it. */
export function AccessSwitch({ userId, perm, label, on, def }: { userId: string; perm: string; label: string; on: boolean; def: boolean }) {
  const target = !on;
  const value = target === def ? "default" : target ? "allow" : "deny";
  return (
    <ActionForm action={setPermissionAction} inlineError={false} toast={false}>
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="key" value={perm} />
      <input type="hidden" name="value" value={value} />
      <button
        type="submit"
        role="switch"
        aria-checked={on}
        aria-label={label}
        className={clsx("relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200", on ? "bg-electric" : "bg-[#d5dbe7]")}
      >
        <span className={clsx("inline-block size-5 rounded-full bg-white shadow transition-transform duration-200", on ? "translate-x-[22px]" : "translate-x-0.5")} />
      </button>
    </ActionForm>
  );
}

export function UndoChange({ userId, perm }: { userId: string; perm: string }) {
  return (
    <ActionForm action={setPermissionAction} inlineError={false}>
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="key" value={perm} />
      <input type="hidden" name="value" value="default" />
      <button type="submit" className="cursor-pointer text-[12px] font-medium text-electric hover:underline">
        Back to default
      </button>
    </ActionForm>
  );
}

export function ResetAll({ userId, name }: { userId: string; name: string }) {
  return (
    <ActionForm action={resetAccessAction} inlineError={false}>
      <input type="hidden" name="userId" value={userId} />
      <button
        type="submit"
        onClick={(e) => {
          if (!confirm(`Reset ${name}'s access to the defaults for their role and team?`)) e.preventDefault();
        }}
        className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-line bg-white px-3 py-1.5 text-[13px] font-medium text-ink-2 hover:border-electric hover:text-electric"
      >
        <RotateCcw className="size-3.5" /> Reset to defaults
      </button>
    </ActionForm>
  );
}
