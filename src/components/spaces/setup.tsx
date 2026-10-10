"use client";

import { FIELD_ICON, FieldPicker } from "./field-picker";
import { useState } from "react";
import clsx from "clsx";
import { ArrowDown, ArrowRight, ArrowUp, Pencil, Plus, Trash2, X, Zap } from "lucide-react";
import {
  archiveFieldAction,
  archiveFolderAction,
  archiveListAction,
  archiveSpaceAction,
  moveStatusAction,
  removeStatusAction,
  saveAutomationAction,
  saveFolderAction,
  saveListAction,
  saveStatusAction,
  setAutomationAction,
  setSpaceMemberAction,
  updateSpaceAction,
} from "@/app/space-actions";
import { ActionForm, Popover, Submit } from "@/components/client";
import { Avatar } from "@/components/avatar";
import { ACTIONS, ACTION_LIST, FIELD_TYPES, PRIORITIES, PRIORITY_LIST, SPACE_COLORS, STATUS_KINDS, STATUS_KIND_LIST, TRIGGERS, TRIGGER_LIST, type Action, type ActionType, type FieldConfig, type FieldOption, type FieldType, type Priority, type Trigger, type TriggerType } from "@/domain/spaces";
import { StatusPill, type SPerson, type SStatus } from "./controls";

const STATUS_COLORS = ["#94a3b8", "#3b82f6", "#8b5cf6", "#f59e0b", "#10b981", "#e5484d", "#14b8a6", "#e0569b", "#6366f1", "#0ea5e9", "#f97316", "#84cc16"];

/* ------------------------------- Details ------------------------------- */

export function DetailsForm({ space, brands }: { space: { id: string; name: string; icon: string | null; color: string; description: string | null; isPrivate: boolean; brandId: string | null }; brands: { id: string; name: string }[] }) {
  const [color, setColor] = useState(space.color);
  return (
    <ActionForm action={updateSpaceAction} className="space-y-3">
      <input type="hidden" name="spaceId" value={space.id} />
      <input type="hidden" name="color" value={color} />
      <div className="grid gap-3 sm:grid-cols-[90px_1fr]">
        <div>
          <label className="label" htmlFor="sd-icon">
            Icon
          </label>
          <input id="sd-icon" name="icon" defaultValue={space.icon ?? ""} maxLength={8} className="field w-full text-center text-[18px]" />
        </div>
        <div>
          <label className="label" htmlFor="sd-name">
            Name
          </label>
          <input id="sd-name" name="name" defaultValue={space.name} required maxLength={60} className="field w-full" />
        </div>
      </div>
      <div>
        <label className="label" htmlFor="sd-desc">
          Description
        </label>
        <input id="sd-desc" name="description" defaultValue={space.description ?? ""} maxLength={300} className="field w-full" />
      </div>
      <div className="flex flex-wrap gap-1.5">
        {SPACE_COLORS.map((c) => (
          <button key={c} type="button" onClick={() => setColor(c)} className={clsx("size-6 cursor-pointer rounded-full", color.toLowerCase() === c.toLowerCase() && "ring-2 ring-ink ring-offset-2")} style={{ background: c }} aria-label={`Colour ${c}`} />
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="sd-priv">
            Who can see it
          </label>
          <select id="sd-priv" name="privacy" defaultValue={space.isPrivate ? "private" : "public"} className="field w-full">
            <option value="public">Everyone</option>
            <option value="private">Private: members only</option>
          </select>
        </div>
        {brands.length > 0 && (
          <div>
            <label className="label" htmlFor="sd-brand">
              Brand
            </label>
            <select id="sd-brand" name="brandId" defaultValue={space.brandId ?? ""} className="field w-full">
              <option value="">Not for a brand</option>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
      <Submit>Save</Submit>
    </ActionForm>
  );
}

/* ------------------------------- Members ------------------------------- */

export function Members({ spaceId, members, people }: { spaceId: string; members: { userId: string; name: string; role: string }[]; people: SPerson[] }) {
  const others = people.filter((p) => !members.some((m) => m.userId === p.id));
  return (
    <div className="space-y-3">
      <ul className="divide-y divide-line rounded-xl border border-line">
        {members.map((m) => (
          <li key={m.userId} className="flex items-center gap-3 px-3 py-2">
            <Avatar name={m.name} size={28} />
            <span className="flex-1 text-[14px] font-medium">{m.name}</span>
            <ActionForm action={setSpaceMemberAction} toast={false} inlineError={false}>
              <input type="hidden" name="spaceId" value={spaceId} />
              <input type="hidden" name="userId" value={m.userId} />
              <select name="role" defaultValue={m.role} onChange={(e) => e.currentTarget.form?.requestSubmit()} aria-label={`${m.name}'s role`} className="field field-sm h-8 w-auto">
                <option value="admin">Admin: sets it up</option>
                <option value="member">Member: works on tasks</option>
                <option value="viewer">Viewer: sees only</option>
                <option value="remove">Remove from space</option>
              </select>
            </ActionForm>
          </li>
        ))}
      </ul>
      {others.length > 0 && (
        <ActionForm action={setSpaceMemberAction} resetOnSuccess className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="spaceId" value={spaceId} />
          <select name="userId" required defaultValue="" aria-label="Person" className="field field-sm h-9 w-auto">
            <option value="" disabled>
              Add someone…
            </option>
            {others.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <select name="role" defaultValue="member" aria-label="Role" className="field field-sm h-9 w-auto">
            <option value="member">Member</option>
            <option value="admin">Admin</option>
            <option value="viewer">Viewer</option>
          </select>
          <Submit size="sm">
            <Plus className="size-3.5" /> Add
          </Submit>
        </ActionForm>
      )}
    </div>
  );
}

/* ------------------------------- Statuses ------------------------------ */

export function Statuses({ spaceId, statuses, counts }: { spaceId: string; statuses: SStatus[]; counts: Record<string, number> }) {
  return (
    <div className="space-y-3">
      <ul className="space-y-1.5">
        {statuses.map((s, i) => (
          <li key={s.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2">
            <div className="flex flex-col">
              <MoveBtn id={s.id} dir="up" disabled={i === 0} />
              <MoveBtn id={s.id} dir="down" disabled={i === statuses.length - 1} />
            </div>
            <StatusPill status={s} />
            <span className="text-[12px] text-muted">{STATUS_KINDS[s.kind as keyof typeof STATUS_KINDS]?.label}</span>
            <span className="text-[12px] tabular-nums text-faint">· {counts[s.id] ?? 0} task(s)</span>
            <span className="ml-auto flex items-center gap-1">
              <Popover label={`Edit ${s.name}`} width={300} triggerClassName="cursor-pointer rounded-md p-1.5 text-faint hover:bg-canvas hover:text-ink" trigger={<Pencil className="size-3.5" />}>
                {(close) => <StatusForm spaceId={spaceId} status={s} onDone={close} />}
              </Popover>
              {statuses.length > 2 && (
                <Popover label={`Remove ${s.name}`} width={280} triggerClassName="cursor-pointer rounded-md p-1.5 text-faint hover:bg-bad-soft hover:text-bad" trigger={<Trash2 className="size-3.5" />}>
                  {(close) => (
                    <ActionForm action={removeStatusAction} onSuccess={close} className="space-y-2 p-3">
                      <input type="hidden" name="statusId" value={s.id} />
                      <label className="label">Move its {counts[s.id] ?? 0} task(s) to</label>
                      <select name="moveTo" className="field w-full" aria-label="Move tasks to">
                        {statuses
                          .filter((x) => x.id !== s.id)
                          .map((x) => (
                            <option key={x.id} value={x.id}>
                              {x.name}
                            </option>
                          ))}
                      </select>
                      <Submit variant="danger" size="sm" className="w-full">
                        Remove “{s.name}”
                      </Submit>
                    </ActionForm>
                  )}
                </Popover>
              )}
            </span>
          </li>
        ))}
      </ul>
      <Popover label="New status" width={300} triggerClassName="inline-flex cursor-pointer items-center gap-1.5 text-[13px] font-medium text-electric" trigger={<><Plus className="size-4" /> Add a status</>}>
        {(close) => <StatusForm spaceId={spaceId} onDone={close} />}
      </Popover>
    </div>
  );
}

function MoveBtn({ id, dir, disabled }: { id: string; dir: "up" | "down"; disabled: boolean }) {
  const Icon = dir === "up" ? ArrowUp : ArrowDown;
  return (
    <ActionForm action={moveStatusAction} toast={false} inlineError={false}>
      <input type="hidden" name="statusId" value={id} />
      <input type="hidden" name="dir" value={dir} />
      <button type="submit" disabled={disabled} className="cursor-pointer rounded p-0.5 text-faint hover:text-ink disabled:opacity-30" aria-label={`Move ${dir}`}>
        <Icon className="size-3" />
      </button>
    </ActionForm>
  );
}

function StatusForm({ spaceId, status, onDone }: { spaceId: string; status?: SStatus; onDone: () => void }) {
  const [color, setColor] = useState(status?.color ?? STATUS_COLORS[1]);
  return (
    <ActionForm action={saveStatusAction} onSuccess={onDone} className="space-y-2.5 p-3">
      <input type="hidden" name="spaceId" value={spaceId} />
      {status && <input type="hidden" name="statusId" value={status.id} />}
      <input type="hidden" name="color" value={color} />
      <div>
        <label className="label">Name</label>
        <input name="name" defaultValue={status?.name ?? ""} required maxLength={30} placeholder="e.g. Waiting for client" className="field w-full" autoFocus />
      </div>
      <div>
        <label className="label">What it means</label>
        <select name="kind" defaultValue={status?.kind ?? "active"} className="field w-full">
          {STATUS_KIND_LIST.map((k) => (
            <option key={k} value={k}>
              {STATUS_KINDS[k].label}: {STATUS_KINDS[k].hint}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {STATUS_COLORS.map((c) => (
          <button key={c} type="button" onClick={() => setColor(c)} className={clsx("size-6 cursor-pointer rounded-full", color === c && "ring-2 ring-ink ring-offset-2")} style={{ background: c }} aria-label={`Colour ${c}`} />
        ))}
      </div>
      <Submit size="sm" className="w-full">
        {status ? "Save" : "Add status"}
      </Submit>
    </ActionForm>
  );
}

/* -------------------------------- Columns ------------------------------ */

export function Columns({ spaceId, fields, statuses }: { spaceId: string; fields: { id: string; name: string; type: string; options: FieldOption[]; config?: FieldConfig | null }[]; statuses: { id: string; name: string; color: string }[] }) {
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const cur = fields.find((f) => f.id === editing);
  return (
    <div className="space-y-3">
      {fields.length > 0 ? (
        <ul className="space-y-1.5">
          {fields.map((f) => {
            const Icon = FIELD_ICON[f.type as FieldType] ?? Pencil;
            return (
              <li key={f.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2">
                <Icon className="size-4 text-muted" />
                <span className="text-[14px] font-medium">{f.name}</span>
                <span className="rounded-md bg-canvas px-1.5 py-0.5 text-[11.5px] font-semibold text-ink-2">{FIELD_TYPES[f.type as keyof typeof FIELD_TYPES]?.label ?? f.type}</span>
                {f.options.length > 0 && <span className="truncate text-[12px] text-muted">{f.options.map((o) => o.label).join(", ")}</span>}
                {f.config?.formula && <span className="truncate font-mono text-[12px] text-muted">{f.config.formula}</span>}
                <span className="ml-auto flex items-center gap-1">
                  <button type="button" onClick={() => setEditing(f.id)} className="cursor-pointer rounded-md p-1.5 text-faint hover:bg-canvas hover:text-ink" aria-label={`Edit ${f.name}`}>
                    <Pencil className="size-3.5" />
                  </button>
                  <ActionForm action={archiveFieldAction} inlineError={false}>
                    <input type="hidden" name="fieldId" value={f.id} />
                    <button type="submit" onClick={(e) => !confirm(`Remove the column “${f.name}”? Its values are hidden.`) && e.preventDefault()} className="cursor-pointer rounded-md p-1.5 text-faint hover:bg-bad-soft hover:text-bad" aria-label={`Remove ${f.name}`}>
                      <Trash2 className="size-3.5" />
                    </button>
                  </ActionForm>
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-[13px] text-muted">No extra columns yet. Add what this team tracks: budget, phone, links, ratings, votes, formulas…</p>
      )}
      <button type="button" onClick={() => setEditing("new")} className="inline-flex cursor-pointer items-center gap-1.5 text-[13px] font-medium text-electric">
        <Plus className="size-4" /> Add a column
      </button>
      {editing && <FieldPicker open onClose={() => setEditing(null)} spaceId={spaceId} fields={fields} statuses={statuses} field={cur} />}
    </div>
  );
}

/* ---------------------------- Lists & folders --------------------------- */

export function ListsAndFolders({ spaceId, folders, lists }: { spaceId: string; folders: { id: string; name: string }[]; lists: { id: string; name: string; folderId: string | null }[] }) {
  return (
    <div className="space-y-2">
      {[...folders.map((f) => ({ f, ls: lists.filter((l) => l.folderId === f.id) })), { f: null, ls: lists.filter((l) => !l.folderId) }].map(({ f, ls }) => (
        <div key={f?.id ?? "none"} className="rounded-xl border border-line bg-surface">
          <div className="flex items-center gap-2 border-b border-line px-3 py-2 text-[12.5px] font-semibold uppercase tracking-[0.06em] text-muted">
            {f ? f.name : "Not in a folder"}
            {f && (
              <span className="ml-auto flex items-center gap-1 normal-case tracking-normal">
                <RenameForm action={saveFolderAction} spaceId={spaceId} idName="folderId" id={f.id} name={f.name} />
                <ActionForm action={archiveFolderAction} inlineError={false}>
                  <input type="hidden" name="folderId" value={f.id} />
                  <button type="submit" className="cursor-pointer rounded-md p-1 text-faint hover:bg-bad-soft hover:text-bad" aria-label={`Remove folder ${f.name}`}>
                    <Trash2 className="size-3.5" />
                  </button>
                </ActionForm>
              </span>
            )}
          </div>
          <ul className="divide-y divide-line/70">
            {ls.map((l) => (
              <li key={l.id} className="flex items-center gap-2 px-3 py-1.5 text-[14px]">
                <span className="flex-1">{l.name}</span>
                <RenameForm action={saveListAction} spaceId={spaceId} idName="listId" id={l.id} name={l.name} folderId={l.folderId} folders={folders} />
                {lists.length > 1 && (
                  <ActionForm action={archiveListAction} inlineError={false}>
                    <input type="hidden" name="listId" value={l.id} />
                    <button type="submit" onClick={(e) => !confirm(`Archive the list “${l.name}” and its tasks?`) && e.preventDefault()} className="cursor-pointer rounded-md p-1 text-faint hover:bg-bad-soft hover:text-bad" aria-label={`Archive ${l.name}`}>
                      <Trash2 className="size-3.5" />
                    </button>
                  </ActionForm>
                )}
              </li>
            ))}
            {!ls.length && <li className="px-3 py-2 text-[12.5px] text-faint">No lists</li>}
          </ul>
        </div>
      ))}
    </div>
  );
}

function RenameForm({ action, spaceId, idName, id, name, folderId, folders }: { action: typeof saveListAction; spaceId: string; idName: string; id: string; name: string; folderId?: string | null; folders?: { id: string; name: string }[] }) {
  return (
    <Popover label={`Rename ${name}`} width={260} triggerClassName="cursor-pointer rounded-md p-1 text-faint hover:bg-canvas hover:text-ink" trigger={<Pencil className="size-3.5" />}>
      {(close) => (
        <ActionForm action={action} onSuccess={close} className="space-y-2 p-3">
          <input type="hidden" name="spaceId" value={spaceId} />
          <input type="hidden" name={idName} value={id} />
          <input name="name" defaultValue={name} required className="field w-full" autoFocus aria-label="Name" />
          {folders && (
            <select name="folderId" defaultValue={folderId ?? ""} className="field w-full" aria-label="Folder">
              <option value="">No folder</option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>
                  In {f.name}
                </option>
              ))}
            </select>
          )}
          <Submit size="sm" className="w-full">
            Save
          </Submit>
        </ActionForm>
      )}
    </Popover>
  );
}

/* ------------------------------ Automations ----------------------------- */

type Auto = { id: string; name: string; trigger: Trigger; actions: Action[]; enabled: boolean; runs: number; lastRunAt: Date | null };

export function Automations({ spaceId, automations, statuses, lists, people }: { spaceId: string; automations: Auto[]; statuses: SStatus[]; lists: { id: string; name: string }[]; people: SPerson[] }) {
  const [adding, setAdding] = useState(false);
  const sname = (id?: string | null) => statuses.find((s) => s.id === id)?.name ?? "?";
  const describe = (a: Action) => {
    switch (a.type) {
      case "set_status":
        return `move it to ${sname(a.statusId)}`;
      case "parent_status":
        return `move the parent task to ${sname(a.statusId)}`;
      case "assign":
        return `assign ${a.userIds.map((u) => people.find((p) => p.id === u)?.name ?? "someone").join(", ")}`;
      case "unassign_all":
        return "remove everyone assigned";
      case "notify":
        return `notify ${a.to === "assignees" ? "the people on it" : a.to === "creator" ? "whoever created it" : (a.userIds ?? []).map((u) => people.find((p) => p.id === u)?.name).join(", ")}`;
      case "set_priority":
        return `set priority ${PRIORITIES[a.priority].label}`;
      case "set_due_in_days":
        return `set due in ${a.days} day(s)`;
      case "move_to_list":
        return `move to ${lists.find((l) => l.id === a.listId)?.name ?? "a list"}`;
      case "add_subtasks":
        return `add ${a.titles.length} subtasks`;
      case "add_comment":
        return "post a comment";
    }
  };
  const when = (t: Trigger) =>
    t.type === "status_changed" ? `When the status becomes ${sname(t.statusId)}` : t.type === "priority_changed" && t.priority ? `When the priority becomes ${PRIORITIES[t.priority].label}` : `When ${TRIGGERS[t.type].label.toLowerCase().replace("…", "")}`;
  return (
    <div className="space-y-3">
      {automations.length > 0 ? (
        <ul className="space-y-2">
          {automations.map((a) => (
            <li key={a.id} className={clsx("rounded-xl border bg-surface px-3.5 py-3", a.enabled ? "border-amber-200" : "border-line opacity-70")}>
              <div className="flex flex-wrap items-center gap-2">
                <Zap className={clsx("size-4", a.enabled ? "text-amber-500" : "text-faint")} />
                <span className="text-[14px] font-semibold">{a.name}</span>
                <span className="text-[12px] text-muted">· ran {a.runs} time(s)</span>
                <span className="ml-auto flex items-center gap-1">
                  <ActionForm action={setAutomationAction} inlineError={false}>
                    <input type="hidden" name="automationId" value={a.id} />
                    <input type="hidden" name="state" value={a.enabled ? "off" : "on"} />
                    <button type="submit" role="switch" aria-checked={a.enabled} aria-label={`${a.name} on/off`} className={clsx("relative inline-flex h-5 w-9 cursor-pointer items-center rounded-full transition-colors", a.enabled ? "bg-amber-500" : "bg-track")}>
                      <span className={clsx("inline-block size-4 rounded-full bg-white shadow transition-transform", a.enabled ? "translate-x-[18px]" : "translate-x-0.5")} />
                    </button>
                  </ActionForm>
                  <ActionForm action={setAutomationAction} inlineError={false}>
                    <input type="hidden" name="automationId" value={a.id} />
                    <input type="hidden" name="state" value="remove" />
                    <button type="submit" onClick={(e) => !confirm(`Remove “${a.name}”?`) && e.preventDefault()} className="cursor-pointer rounded-md p-1 text-faint hover:bg-bad-soft hover:text-bad" aria-label={`Remove ${a.name}`}>
                      <Trash2 className="size-3.5" />
                    </button>
                  </ActionForm>
                </span>
              </div>
              <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[13px] text-ink-2">
                <span className="rounded-md bg-electric-soft px-1.5 py-0.5 font-medium text-electric">{when(a.trigger)}</span>
                <ArrowRight className="size-3.5 text-faint" />
                {a.actions.map((x, i) => (
                  <span key={i} className="rounded-md bg-canvas px-1.5 py-0.5">
                    {describe(x)}
                  </span>
                ))}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[13px] text-muted">No automations yet. They do the boring part by themselves: assign, notify, set dates, add checklists.</p>
      )}
      {adding ? (
        <AutomationBuilder spaceId={spaceId} statuses={statuses} lists={lists} people={people} onDone={() => setAdding(false)} />
      ) : (
        <button type="button" onClick={() => setAdding(true)} className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-2 text-[13.5px] font-semibold text-white transition-transform hover:bg-amber-600 active:scale-[0.97]">
          <Zap className="size-4" /> New automation
        </button>
      )}
    </div>
  );
}

function AutomationBuilder({ spaceId, statuses, lists, people, onDone }: { spaceId: string; statuses: SStatus[]; lists: { id: string; name: string }[]; people: SPerson[]; onDone: () => void }) {
  const [trigger, setTrigger] = useState<TriggerType>("status_changed");
  const [actions, setActions] = useState<Action[]>([]);
  const [next, setNext] = useState<ActionType>("assign");
  const add = () => {
    const a: Action =
      next === "set_status" || next === "parent_status"
        ? { type: next, statusId: statuses[0]?.id ?? "" }
        : next === "assign"
          ? { type: "assign", userIds: [] }
          : next === "notify"
            ? { type: "notify", to: "assignees" }
            : next === "set_priority"
              ? { type: "set_priority", priority: "high" }
              : next === "set_due_in_days"
                ? { type: "set_due_in_days", days: 2 }
                : next === "move_to_list"
                  ? { type: "move_to_list", listId: lists[0]?.id ?? "" }
                  : next === "add_subtasks"
                    ? { type: "add_subtasks", titles: [] }
                    : next === "add_comment"
                      ? { type: "add_comment", text: "" }
                      : { type: "unassign_all" };
    setActions((xs) => [...xs, a]);
  };
  const set = (i: number, a: Action) => setActions((xs) => xs.map((x, j) => (j === i ? a : x)));
  return (
    <ActionForm action={saveAutomationAction} onSuccess={onDone} className="space-y-4 rounded-2xl border border-amber-200 bg-amber-50/40 dark:bg-amber-400/10 p-4">
      <input type="hidden" name="spaceId" value={spaceId} />
      <input type="hidden" name="actions" value={JSON.stringify(actions)} />
      <div>
        <label className="label" htmlFor="au-name">
          Name
        </label>
        <input id="au-name" name="name" required maxLength={80} placeholder="e.g. Review: tell the account manager" className="field w-full" />
      </div>
      <div className="rounded-xl bg-surface p-3">
        <div className="eyebrow mb-2">When</div>
        <div className="flex flex-wrap gap-2">
          <select name="trigger" value={trigger} onChange={(e) => setTrigger(e.target.value as TriggerType)} className="field field-sm h-9 w-auto" aria-label="When">
            {TRIGGER_LIST.map((t) => (
              <option key={t} value={t}>
                {TRIGGERS[t].label}
              </option>
            ))}
          </select>
          {trigger === "status_changed" && (
            <select name="triggerStatusId" className="field field-sm h-9 w-auto" aria-label="Status">
              {statuses.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          )}
          {trigger === "priority_changed" && (
            <select name="triggerPriority" className="field field-sm h-9 w-auto" aria-label="Priority">
              <option value="">Any priority</option>
              {PRIORITY_LIST.map((p) => (
                <option key={p} value={p}>
                  {PRIORITIES[p].label}
                </option>
              ))}
            </select>
          )}
          {lists.length > 1 && (
            <select name="triggerListId" className="field field-sm h-9 w-auto" aria-label="In list">
              <option value="">In any list</option>
              {lists.map((l) => (
                <option key={l.id} value={l.id}>
                  In {l.name}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>
      <div className="rounded-xl bg-surface p-3">
        <div className="eyebrow mb-2">Then</div>
        <ol className="space-y-2">
          {actions.map((a, i) => (
            <li key={i} className="flex flex-wrap items-start gap-2 rounded-lg border border-line p-2">
              <span className="mt-1.5 text-[12px] font-bold text-amber-600">{i + 1}.</span>
              <span className="mt-1.5 text-[13px] font-medium">{ACTIONS[a.type].label}</span>
              <div className="min-w-[180px] flex-1">
                <ActionFields a={a} set={(x) => set(i, x)} statuses={statuses} lists={lists} people={people} />
              </div>
              <button type="button" onClick={() => setActions((xs) => xs.filter((_, j) => j !== i))} className="cursor-pointer rounded p-1 text-faint hover:text-bad" aria-label="Remove">
                <X className="size-4" />
              </button>
            </li>
          ))}
        </ol>
        <div className="mt-2 flex flex-wrap gap-2">
          <select value={next} onChange={(e) => setNext(e.target.value as ActionType)} className="field field-sm h-9 w-auto" aria-label="Add an action">
            {ACTION_LIST.map((t) => (
              <option key={t} value={t}>
                {ACTIONS[t].label}
              </option>
            ))}
          </select>
          <button type="button" onClick={add} className="inline-flex h-9 cursor-pointer items-center gap-1 rounded-lg border border-line bg-surface px-3 text-[13px] font-medium hover:border-electric hover:text-electric">
            <Plus className="size-3.5" /> Add
          </button>
        </div>
      </div>
      <div className="flex gap-2">
        <Submit disabled={!actions.length}>
          <Zap className="size-4" /> Save automation
        </Submit>
        <button type="button" onClick={onDone} className="cursor-pointer px-3 text-[13.5px] text-muted hover:text-ink">
          Cancel
        </button>
      </div>
    </ActionForm>
  );
}

function ActionFields({ a, set, statuses, lists, people }: { a: Action; set: (a: Action) => void; statuses: SStatus[]; lists: { id: string; name: string }[]; people: SPerson[] }) {
  switch (a.type) {
    case "set_status":
    case "parent_status":
      return (
        <select value={a.statusId} onChange={(e) => set({ ...a, statusId: e.target.value })} className="field field-sm w-full" aria-label="Status">
          {statuses.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      );
    case "assign":
      return <PeoplePick value={a.userIds} people={people} onChange={(userIds) => set({ ...a, userIds })} />;
    case "notify":
      return (
        <div className="space-y-1.5">
          <select value={a.to} onChange={(e) => set({ ...a, to: e.target.value as "assignees" | "creator" | "people" })} className="field field-sm w-full" aria-label="Who">
            <option value="assignees">The people on it</option>
            <option value="creator">Whoever created it</option>
            <option value="people">Specific people…</option>
          </select>
          {a.to === "people" && <PeoplePick value={a.userIds ?? []} people={people} onChange={(userIds) => set({ ...a, userIds })} />}
          <input value={a.message ?? ""} onChange={(e) => set({ ...a, message: e.target.value })} placeholder="Message (optional), e.g. Ready for review" className="field field-sm w-full" aria-label="Message" />
        </div>
      );
    case "set_priority":
      return (
        <select value={a.priority} onChange={(e) => set({ ...a, priority: e.target.value as Priority })} className="field field-sm w-full" aria-label="Priority">
          {PRIORITY_LIST.map((p) => (
            <option key={p} value={p}>
              {PRIORITIES[p].label}
            </option>
          ))}
        </select>
      );
    case "set_due_in_days":
      return <input type="number" min={0} max={365} value={a.days} onChange={(e) => set({ ...a, days: Number(e.target.value) })} className="field field-sm w-24" aria-label="Days" />;
    case "move_to_list":
      return (
        <select value={a.listId} onChange={(e) => set({ ...a, listId: e.target.value })} className="field field-sm w-full" aria-label="List">
          {lists.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      );
    case "add_subtasks":
      return <textarea value={a.titles.join("\n")} onChange={(e) => set({ ...a, titles: e.target.value.split("\n") })} rows={3} placeholder="One subtask per line" className="field w-full text-[13px]" aria-label="Subtasks" />;
    case "add_comment":
      return <input value={a.text} onChange={(e) => set({ ...a, text: e.target.value })} placeholder="The comment" className="field field-sm w-full" aria-label="Comment" />;
    default:
      return null;
  }
}

function PeoplePick({ value, people, onChange }: { value: string[]; people: SPerson[]; onChange: (v: string[]) => void }) {
  return (
    <div className="flex flex-wrap gap-1">
      {people.map((p) => {
        const on = value.includes(p.id);
        return (
          <button key={p.id} type="button" onClick={() => onChange(on ? value.filter((x) => x !== p.id) : [...value, p.id])} className={clsx("cursor-pointer rounded-full border px-2 py-0.5 text-[12px]", on ? "border-electric bg-electric-soft text-electric" : "border-line text-ink-2")}>
            {p.name}
          </button>
        );
      })}
    </div>
  );
}

/* --------------------------------- Danger -------------------------------- */

export function ArchiveSpace({ spaceId, name }: { spaceId: string; name: string }) {
  return (
    <ActionForm action={archiveSpaceAction}>
      <input type="hidden" name="spaceId" value={spaceId} />
      <button type="submit" onClick={(e) => !confirm(`Archive “${name}”? It disappears for everyone; its history is kept.`) && e.preventDefault()} className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 text-[13.5px] font-medium text-bad hover:border-bad/30 hover:bg-bad-soft">
        <Trash2 className="size-4" /> Archive this space
      </button>
    </ActionForm>
  );
}
