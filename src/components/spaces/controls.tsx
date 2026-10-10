"use client";

import { useRef, useState } from "react";
import clsx from "clsx";
import { Check, ChevronDown, Flag, Plus, Star, UserPlus, X } from "lucide-react";
import { createWorkTaskAction, setFieldValueAction, updateWorkTaskAction } from "@/app/space-actions";
import { ActionForm, Popover, Submit } from "@/components/client";
import { Avatar } from "@/components/avatar";
import { DateInput } from "@/components/date-input";
import { FIELD_TYPES, PRIORITIES, PRIORITY_LIST, STATUS_KINDS, type FieldOption, type FieldType, type Priority } from "@/domain/spaces";
import { addDays, formatDay, relativeDays, todayISO } from "@/lib/dates";

export type SStatus = { id: string; name: string; color: string; kind: string };
export type SPerson = { id: string; name: string };
export type SField = { id: string; name: string; type: FieldType; options: FieldOption[] };

/* ------------------------------ Status ------------------------------ */

export function StatusPill({ status, size = "md", className }: { status: SStatus | undefined; size?: "sm" | "md"; className?: string }) {
  if (!status) return null;
  return (
    <span
      className={clsx("inline-flex max-w-full items-center gap-1.5 truncate rounded-full font-semibold uppercase tracking-[0.04em]", size === "sm" ? "px-2 py-0.5 text-[10.5px]" : "px-2.5 py-1 text-[11px]", className)}
      style={{ background: `color-mix(in srgb, ${status.color} 14%, white)`, color: `color-mix(in srgb, ${status.color} 80%, black)` }}
    >
      <span className="size-1.5 shrink-0 rounded-full" style={{ background: status.color }} />
      <span className="truncate">{status.name}</span>
    </span>
  );
}

export function StatusPicker({ taskId, statuses, current, disabled, size }: { taskId: string; statuses: SStatus[]; current: string; disabled?: boolean; size?: "sm" | "md" }) {
  const cur = statuses.find((s) => s.id === current);
  if (disabled) return <StatusPill status={cur} size={size} />;
  return (
    <Popover label={`Status: ${cur?.name ?? ""}`} width={240} triggerClassName="max-w-full cursor-pointer rounded-full transition-transform active:scale-95" trigger={<StatusPill status={cur} size={size} />}>
      {(close) => (
        <div className="py-1">
          {(["open", "active", "review", "done", "closed"] as const).map((k) => {
            const group = statuses.filter((s) => s.kind === k);
            if (!group.length) return null;
            return (
              <div key={k}>
                <div className="px-3 pb-1 pt-2 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-faint">{STATUS_KINDS[k].label}</div>
                {group.map((s) => (
                  <ActionForm key={s.id} action={updateWorkTaskAction} inlineError={false} toast={false} onSuccess={close}>
                    <input type="hidden" name="taskId" value={taskId} />
                    <input type="hidden" name="statusId" value={s.id} />
                    <button type="submit" className="flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-[13.5px] hover:bg-canvas">
                      <span className="size-2.5 rounded-full" style={{ background: s.color }} />
                      <span className="flex-1">{s.name}</span>
                      {s.id === current && <Check className="size-3.5 text-electric" />}
                    </button>
                  </ActionForm>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </Popover>
  );
}

/* ----------------------------- Priority ----------------------------- */

export function PriorityFlag({ value, showLabel }: { value: Priority | null; showLabel?: boolean }) {
  if (!value) return showLabel ? <span className="text-[12.5px] text-faint">—</span> : <Flag className="size-3.5 text-line-strong" />;
  const p = PRIORITIES[value];
  return (
    <span className="inline-flex items-center gap-1 text-[12.5px] font-medium" style={{ color: p.color }} title={`${p.label} priority`}>
      <Flag className="size-3.5" fill="currentColor" />
      {showLabel && p.label}
    </span>
  );
}

export function PriorityPicker({ taskId, value, disabled, showLabel }: { taskId: string; value: Priority | null; disabled?: boolean; showLabel?: boolean }) {
  if (disabled) return <PriorityFlag value={value} showLabel={showLabel} />;
  return (
    <Popover label="Priority" width={200} triggerClassName="cursor-pointer rounded-md px-1 py-0.5 hover:bg-canvas" trigger={<PriorityFlag value={value} showLabel={showLabel} />}>
      {(close) => (
        <div className="py-1">
          {[...PRIORITY_LIST, ""].map((p) => (
            <ActionForm key={p || "none"} action={updateWorkTaskAction} inlineError={false} toast={false} onSuccess={close}>
              <input type="hidden" name="taskId" value={taskId} />
              <input type="hidden" name="priority" value={p} />
              <button type="submit" className="flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-[13.5px] hover:bg-canvas">
                {p ? <Flag className="size-3.5" fill={PRIORITIES[p as Priority].color} color={PRIORITIES[p as Priority].color} /> : <X className="size-3.5 text-faint" />}
                <span className="flex-1">{p ? PRIORITIES[p as Priority].label : "No priority"}</span>
                {(value ?? "") === p && <Check className="size-3.5 text-electric" />}
              </button>
            </ActionForm>
          ))}
        </div>
      )}
    </Popover>
  );
}

/* ----------------------------- Assignees ---------------------------- */

export function Faces({ ids, people, size = 24, max = 3 }: { ids: string[]; people: SPerson[]; size?: number; max?: number }) {
  const names = ids.map((id) => people.find((p) => p.id === id)?.name).filter(Boolean) as string[];
  if (!names.length)
    return (
      <span className="inline-grid place-items-center rounded-full border border-dashed border-line-strong text-faint" style={{ width: size, height: size }} title="Nobody yet">
        <UserPlus className="size-3" />
      </span>
    );
  return (
    <span className="flex -space-x-1.5" title={names.join(", ")}>
      {names.slice(0, max).map((n) => (
        <Avatar key={n} name={n} size={size} ring badge={false} />
      ))}
      {names.length > max && (
        <span className="grid place-items-center rounded-full bg-canvas text-[10.5px] font-semibold text-ink-2 ring-2 ring-white" style={{ width: size, height: size }}>
          +{names.length - max}
        </span>
      )}
    </span>
  );
}

export function AssigneePicker({ taskId, people, value, disabled, meId }: { taskId: string; people: SPerson[]; value: string[]; disabled?: boolean; meId: string }) {
  const [q, setQ] = useState("");
  if (disabled) return <Faces ids={value} people={people} />;
  return (
    <Popover label="Assignees" width={260} triggerClassName="cursor-pointer rounded-full transition-transform active:scale-95" trigger={<Faces ids={value} people={people} />}>
      {(close) => (
        <ActionForm action={updateWorkTaskAction} toast={false} onSuccess={close} className="p-2">
          <input type="hidden" name="taskId" value={taskId} />
          <input type="hidden" name="assignees" value="1" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people…" className="field field-sm mb-1.5 w-full" autoFocus />
          <div className="max-h-[240px] overflow-y-auto">
            {[...people]
              .sort((a, b) => (a.id === meId ? -1 : b.id === meId ? 1 : a.name.localeCompare(b.name)))
              .filter((p) => !q || p.name.toLowerCase().includes(q.toLowerCase()))
              .map((p) => (
                <label key={p.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-[13.5px] hover:bg-canvas">
                  <input type="checkbox" name="assigneeIds" value={p.id} defaultChecked={value.includes(p.id)} className="size-4 accent-[var(--color-electric)]" />
                  <Avatar name={p.name} size={22} badge={false} />
                  <span className="flex-1 truncate">{p.id === meId ? `${p.name} (me)` : p.name}</span>
                </label>
              ))}
          </div>
          <Submit size="sm" className="mt-2 w-full">
            Save
          </Submit>
        </ActionForm>
      )}
    </Popover>
  );
}

/* ------------------------------ Due date ---------------------------- */

export function DueLabel({ value, done }: { value: string | null; done?: boolean }) {
  if (!value) return <span className="text-[12.5px] text-faint">—</span>;
  const today = todayISO();
  const r = relativeDays(value, today);
  const late = !done && value < today;
  const soon = !done && !late && r.days <= 1;
  return (
    <span className={clsx("whitespace-nowrap text-[12.5px] font-medium tabular-nums", late ? "text-bad" : soon ? "text-warn" : "text-ink-2")} title={formatDay(value)}>
      {late ? `${-r.days}d late` : r.days >= 0 && r.days <= 1 ? r.label[0].toUpperCase() + r.label.slice(1) : formatDay(value)}
    </span>
  );
}

export function DuePicker({ taskId, value, done, disabled, name = "dueDate", label = "Due date" }: { taskId: string; value: string | null; done?: boolean; disabled?: boolean; name?: string; label?: string }) {
  if (disabled) return <DueLabel value={value} done={done} />;
  return (
    <Popover label={label} width={250} triggerClassName="cursor-pointer rounded-md px-1 py-0.5 hover:bg-canvas" trigger={<DueLabel value={value} done={done} />}>
      {(close) => (
        <div className="space-y-2 p-3">
          <ActionForm action={updateWorkTaskAction} toast={false} onSuccess={close}>
            <input type="hidden" name="taskId" value={taskId} />
            <label className="label">{label}</label>
            <DateInput name={name} defaultValue={value ?? ""} autoSubmit aria-label={label} className="w-full" />
          </ActionForm>
          <div className="flex flex-wrap gap-1">
            {[
              ["Today", 0],
              ["Tomorrow", 1],
              ["In 3 days", 3],
              ["Next week", 7],
            ].map(([l, d]) => (
              <ActionForm key={l} action={updateWorkTaskAction} toast={false} onSuccess={close} inlineError={false}>
                <input type="hidden" name="taskId" value={taskId} />
                <input type="hidden" name={name} value={addDays(todayISO(), Number(d))} />
                <button type="submit" className="cursor-pointer rounded-full border border-line px-2 py-0.5 text-[12px] hover:border-electric hover:text-electric">
                  {l}
                </button>
              </ActionForm>
            ))}
            {value && (
              <ActionForm action={updateWorkTaskAction} toast={false} onSuccess={close} inlineError={false}>
                <input type="hidden" name="taskId" value={taskId} />
                <input type="hidden" name={name} value="" />
                <button type="submit" className="cursor-pointer rounded-full px-2 py-0.5 text-[12px] text-bad hover:bg-bad-soft">
                  Clear
                </button>
              </ActionForm>
            )}
          </div>
        </div>
      )}
    </Popover>
  );
}

/* ---------------------------- Custom fields -------------------------- */

const money = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

export function FieldValue({ field, value, people }: { field: SField; value: unknown; people: SPerson[] }) {
  if (value === null || value === undefined || value === "") return <span className="text-[12.5px] text-faint">—</span>;
  switch (field.type) {
    case "dropdown": {
      const o = field.options.find((x) => x.id === value);
      return o ? <OptionChip o={o} /> : <span className="text-faint">—</span>;
    }
    case "labels":
      return (
        <span className="flex flex-wrap gap-1">
          {(value as string[]).map((id) => {
            const o = field.options.find((x) => x.id === id);
            return o ? <OptionChip key={id} o={o} /> : null;
          })}
        </span>
      );
    case "checkbox":
      return <span className="grid size-4 place-items-center rounded bg-ok text-white">✓</span>;
    case "money":
      return <span className="text-[13px] tabular-nums">EGP {money.format(Number(value))}</span>;
    case "number":
      return <span className="text-[13px] tabular-nums">{money.format(Number(value))}</span>;
    case "date":
      return <span className="text-[12.5px] tabular-nums">{formatDay(String(value))}</span>;
    case "link":
      return (
        <a href={String(value)} target="_blank" rel="noopener noreferrer" className="truncate text-[12.5px] text-electric hover:underline" onClick={(e) => e.stopPropagation()}>
          {String(value).replace(/^https?:\/\/(www\.)?/, "").slice(0, 32)}
        </a>
      );
    case "email":
      return (
        <a href={`mailto:${String(value)}`} className="truncate text-[12.5px] text-electric hover:underline" onClick={(e) => e.stopPropagation()}>
          {String(value)}
        </a>
      );
    case "phone":
      return (
        <a href={`tel:${String(value).replace(/\s/g, "")}`} className="text-[12.5px] tabular-nums text-electric hover:underline" onClick={(e) => e.stopPropagation()}>
          {String(value)}
        </a>
      );
    case "person": {
      const p = people.find((x) => x.id === value);
      return p ? (
        <span className="inline-flex items-center gap-1.5 text-[12.5px]">
          <Avatar name={p.name} size={20} badge={false} /> {p.name}
        </span>
      ) : (
        <span className="text-faint">—</span>
      );
    }
    case "rating":
      return (
        <span className="inline-flex text-amber-400" aria-label={`${value} of 5`}>
          {Array.from({ length: 5 }, (_, i) => (
            <Star key={i} className="size-3.5" fill={i < Number(value) ? "currentColor" : "none"} />
          ))}
        </span>
      );
    case "progress":
      return (
        <span className="flex min-w-[90px] items-center gap-1.5">
          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#e8ecf3]">
            <span className="block h-full rounded-full bg-ok" style={{ width: `${Number(value)}%` }} />
          </span>
          <span className="text-[11.5px] tabular-nums text-muted">{Number(value)}%</span>
        </span>
      );
    default:
      return <span className="line-clamp-2 text-[13px]">{String(value)}</span>;
  }
}

function OptionChip({ o }: { o: FieldOption }) {
  return (
    <span className="inline-flex rounded-md px-1.5 py-0.5 text-[11.5px] font-semibold" style={{ background: `color-mix(in srgb, ${o.color} 15%, white)`, color: `color-mix(in srgb, ${o.color} 80%, black)` }}>
      {o.label}
    </span>
  );
}

export function FieldEditor({ taskId, field, value, people, disabled }: { taskId: string; field: SField; value: unknown; people: SPerson[]; disabled?: boolean }) {
  if (disabled) return <FieldValue field={field} value={value} people={people} />;
  if (field.type === "checkbox")
    return (
      <ActionForm action={setFieldValueAction} toast={false} inlineError={false}>
        <input type="hidden" name="taskId" value={taskId} />
        <input type="hidden" name="fieldId" value={field.id} />
        <input type="hidden" name="value" value={value ? "" : "on"} />
        <button type="submit" role="checkbox" aria-checked={!!value} aria-label={field.name} className={clsx("grid size-[18px] cursor-pointer place-items-center rounded border transition-colors", value ? "border-ok bg-ok text-white" : "border-line-strong bg-white hover:border-electric")}>
          {!!value && <Check className="size-3" strokeWidth={3} />}
        </button>
      </ActionForm>
    );
  return (
    <Popover label={field.name} width={field.type === "labels" || field.type === "dropdown" ? 240 : 280} triggerClassName="min-h-[24px] max-w-full cursor-pointer rounded-md px-1 py-0.5 text-left hover:bg-canvas" trigger={<FieldValue field={field} value={value} people={people} />}>
      {(close) => <FieldForm taskId={taskId} field={field} value={value} people={people} close={close} />}
    </Popover>
  );
}

function FieldForm({ taskId, field, value, people, close }: { taskId: string; field: SField; value: unknown; people: SPerson[]; close: () => void }) {
  const hidden = (
    <>
      <input type="hidden" name="taskId" value={taskId} />
      <input type="hidden" name="fieldId" value={field.id} />
    </>
  );
  if (field.type === "dropdown")
    return (
      <div className="py-1">
        {[...field.options, null].map((o) => (
          <ActionForm key={o?.id ?? "none"} action={setFieldValueAction} toast={false} onSuccess={close} inlineError={false}>
            {hidden}
            <input type="hidden" name="value" value={o?.id ?? ""} />
            <button type="submit" className="flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-[13.5px] hover:bg-canvas">
              {o ? <OptionChip o={o} /> : <span className="text-muted">Clear</span>}
              {value === o?.id && <Check className="ml-auto size-3.5 text-electric" />}
            </button>
          </ActionForm>
        ))}
      </div>
    );
  if (field.type === "labels")
    return (
      <ActionForm action={setFieldValueAction} toast={false} onSuccess={close} className="p-2">
        {hidden}
        <input type="hidden" name="multi" value="1" />
        {field.options.map((o) => (
          <label key={o.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-canvas">
            <input type="checkbox" name="value" value={o.id} defaultChecked={Array.isArray(value) && value.includes(o.id)} className="size-4 accent-[var(--color-electric)]" />
            <OptionChip o={o} />
          </label>
        ))}
        <Submit size="sm" className="mt-1.5 w-full">
          Save
        </Submit>
      </ActionForm>
    );
  if (field.type === "rating")
    return (
      <div className="flex items-center gap-1 p-3">
        {[1, 2, 3, 4, 5].map((n) => (
          <ActionForm key={n} action={setFieldValueAction} toast={false} onSuccess={close} inlineError={false}>
            {hidden}
            <input type="hidden" name="value" value={value === n ? "" : String(n)} />
            <button type="submit" className="cursor-pointer text-amber-400 transition-transform hover:scale-110" aria-label={`${n} stars`}>
              <Star className="size-6" fill={Number(value) >= n ? "currentColor" : "none"} />
            </button>
          </ActionForm>
        ))}
      </div>
    );
  if (field.type === "person")
    return (
      <div className="max-h-[260px] overflow-y-auto py-1">
        {[...people, null].map((p) => (
          <ActionForm key={p?.id ?? "none"} action={setFieldValueAction} toast={false} onSuccess={close} inlineError={false}>
            {hidden}
            <input type="hidden" name="value" value={p?.id ?? ""} />
            <button type="submit" className="flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-[13.5px] hover:bg-canvas">
              {p ? (
                <>
                  <Avatar name={p.name} size={20} badge={false} /> {p.name}
                </>
              ) : (
                <span className="text-muted">Clear</span>
              )}
            </button>
          </ActionForm>
        ))}
      </div>
    );
  if (field.type === "date")
    return (
      <ActionForm action={setFieldValueAction} toast={false} onSuccess={close} className="p-3">
        {hidden}
        <DateInput name="value" defaultValue={typeof value === "string" ? value : ""} autoSubmit aria-label={field.name} className="w-full" />
      </ActionForm>
    );
  const type = field.type === "number" || field.type === "money" || field.type === "progress" ? "number" : field.type === "email" ? "email" : field.type === "link" ? "url" : field.type === "phone" ? "tel" : "text";
  return (
    <ActionForm action={setFieldValueAction} toast={false} onSuccess={close} className="space-y-2 p-3">
      {hidden}
      <label className="label">
        {field.name} <span className="font-normal text-muted">· {FIELD_TYPES[field.type].label}</span>
      </label>
      {field.type === "text" ? (
        <textarea name="value" defaultValue={value ? String(value) : ""} rows={3} className="field w-full" autoFocus />
      ) : (
        <input name="value" type={type} step="any" min={field.type === "progress" ? 0 : undefined} max={field.type === "progress" ? 100 : undefined} defaultValue={value !== null && value !== undefined ? String(value) : ""} className="field w-full" autoFocus />
      )}
      <Submit size="sm" className="w-full">
        Save
      </Submit>
    </ActionForm>
  );
}

/* ------------------------------ Quick add --------------------------- */

/** Type and press Enter. Paste several lines to add several tasks at once. */
export function QuickAdd({ listId, statusId, parentId, placeholder = "Add a task…", assigneeId, compact }: { listId: string; statusId?: string; parentId?: string; placeholder?: string; assigneeId?: string; compact?: boolean }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState("");
  const lines = text.split(/\r?\n/).filter((l) => l.trim()).length;
  return (
    <ActionForm action={createWorkTaskAction} resetOnSuccess onSuccess={() => setText("")} className={clsx("group flex items-start gap-2", compact ? "px-2 py-1" : "px-3 py-2")}>
      <input type="hidden" name="listId" value={listId} />
      {statusId && <input type="hidden" name="statusId" value={statusId} />}
      {parentId && <input type="hidden" name="parentId" value={parentId} />}
      {assigneeId && <input type="hidden" name="assigneeIds" value={assigneeId} />}
      <Plus className="mt-2 size-4 shrink-0 text-faint group-focus-within:text-electric" />
      <textarea
        ref={ref}
        name="title"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={Math.min(6, Math.max(1, lines))}
        placeholder={placeholder}
        aria-label={placeholder}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            if (text.trim()) e.currentTarget.form?.requestSubmit();
          }
        }}
        className="min-w-0 flex-1 resize-none bg-transparent py-1.5 text-[14px] placeholder:text-faint focus:outline-none"
      />
      {text.trim() && (
        <Submit size="sm" variant="primary">
          {lines > 1 ? `Add ${lines}` : "Add"}
        </Submit>
      )}
    </ActionForm>
  );
}

export function Chevron({ open }: { open: boolean }) {
  return <ChevronDown className={clsx("size-4 text-faint transition-transform", !open && "-rotate-90")} />;
}
