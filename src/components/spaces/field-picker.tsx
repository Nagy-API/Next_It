"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";
import {
  AlignLeft,
  Calculator,
  Calendar,
  CheckSquare,
  ChevronDown,
  CircleDollarSign,
  Gauge,
  Globe,
  Hash,
  Link2,
  ListChecks,
  Mail,
  MapPin,
  MousePointerClick,
  Paperclip,
  PenLine,
  Phone,
  Search,
  Sigma,
  Star,
  Tags,
  ThumbsUp,
  TrendingUp,
  Type,
  Users,
  type LucideIcon,
} from "lucide-react";
import { saveFieldAction } from "@/app/space-actions";
import { ActionForm, Modal, Submit } from "@/components/client";
import { FIELD_GROUPS, FIELD_TYPES, FIELD_TYPE_LIST, type FieldConfig, type FieldOption, type FieldType } from "@/domain/spaces";
import { formulaProblem } from "@/domain/field-formula";

export const FIELD_ICON: Record<FieldType, LucideIcon> = {
  text: Type,
  textarea: AlignLeft,
  number: Hash,
  money: CircleDollarSign,
  date: Calendar,
  checkbox: CheckSquare,
  dropdown: ChevronDown,
  labels: Tags,
  rating: Star,
  voting: ThumbsUp,
  person: Users,
  email: Mail,
  phone: Phone,
  link: Globe,
  location: MapPin,
  progress: Gauge,
  progress_auto: TrendingUp,
  tasks: ListChecks,
  signature: PenLine,
  button: MousePointerClick,
  formula: Calculator,
  relationship: Link2,
  rollup: Sigma,
  files: Paperclip,
};

/** A soft colour per group so the list is easy to scan. */
const GROUP_COLOR: Record<string, string> = { Basic: "#3b82f6", Choice: "#8b5cf6", Contact: "#10b981", Progress: "#f59e0b", Smart: "#e0569b" };

type F = { id: string; name: string; type: string; options: FieldOption[]; config?: FieldConfig | null };

/**
 * "+ Column": pick a type from a searchable list on the left (grouped like ClickUp), then name it and set
 * what it needs on the right. Editing an existing column opens the same panel with its type fixed.
 */
export function FieldPicker({
  open,
  onClose,
  spaceId,
  fields,
  statuses,
  field,
}: {
  open: boolean;
  onClose: () => void;
  spaceId: string;
  fields: F[];
  statuses: { id: string; name: string; color: string }[];
  field?: F;
}) {
  const [type, setType] = useState<FieldType>((field?.type as FieldType) ?? "text");
  const [q, setQ] = useState("");
  const list = useMemo(() => FIELD_TYPE_LIST.filter((t) => `${FIELD_TYPES[t].label} ${FIELD_TYPES[t].hint}`.toLowerCase().includes(q.trim().toLowerCase())), [q]);
  return (
    <Modal open={open} onClose={onClose} title={field ? `Edit “${field.name}”` : "Add a column"} width={760}>
      <div className={clsx("grid gap-4", !field && "md:grid-cols-[260px_minmax(0,1fr)]")}>
        {!field && (
          <div className="min-w-0">
            <div className="relative mb-2">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-faint" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search column types…" className="field h-9 pl-8" autoFocus />
            </div>
            <div className="max-h-[420px] space-y-3 overflow-y-auto pr-1">
              {FIELD_GROUPS.map((g) => {
                const items = list.filter((t) => FIELD_TYPES[t].group === g);
                if (!items.length) return null;
                return (
                  <div key={g}>
                    <div className="mb-1 px-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-faint">{g}</div>
                    {items.map((t) => {
                      const Icon = FIELD_ICON[t];
                      return (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setType(t)}
                          aria-pressed={type === t}
                          className={clsx("flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors", type === t ? "bg-electric-soft" : "hover:bg-hover")}
                        >
                          <span className="tint grid size-7 shrink-0 place-items-center rounded-lg" style={{ "--tint": GROUP_COLOR[g] } as React.CSSProperties}>
                            <Icon className="size-4" />
                          </span>
                          <span className="min-w-0">
                            <span className={clsx("block text-[13.5px] font-semibold", type === t ? "text-electric" : "text-ink")}>{FIELD_TYPES[t].label}</span>
                            <span className="block truncate text-[11.5px] text-muted">{FIELD_TYPES[t].hint}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
              {!list.length && <p className="px-2 py-4 text-center text-[13px] text-muted">No column type matches “{q}”.</p>}
            </div>
          </div>
        )}
        <FieldSettings key={type} spaceId={spaceId} type={type} fields={fields.filter((f) => f.id !== field?.id)} statuses={statuses} field={field} onDone={onClose} />
      </div>
    </Modal>
  );
}

function FieldSettings({ spaceId, type, fields, statuses, field, onDone }: { spaceId: string; type: FieldType; fields: F[]; statuses: { id: string; name: string; color: string }[]; field?: F; onDone: () => void }) {
  const cfg = field?.config ?? {};
  const [formula, setFormula] = useState(cfg.formula ?? "");
  const [rel, setRel] = useState(cfg.relationFieldId ?? "");
  const [target, setTarget] = useState(cfg.targetFieldId ?? "");
  const [fn, setFn] = useState<NonNullable<FieldConfig["fn"]>>(cfg.fn ?? "sum");
  const [action, setAction] = useState<NonNullable<FieldConfig["action"]>>(cfg.action ?? "done");
  const [statusId, setStatusId] = useState(cfg.statusId ?? statuses[0]?.id ?? "");
  const [label, setLabel] = useState(cfg.buttonLabel ?? "");
  const Icon = FIELD_ICON[type];
  const numeric = fields.filter((f) => ["number", "money", "rating", "progress", "progress_auto", "rollup", "files"].includes(f.type));
  const relations = fields.filter((f) => f.type === "relationship");
  const config: FieldConfig | null =
    type === "formula" ? { formula } : type === "rollup" ? { relationFieldId: rel, targetFieldId: target || undefined, fn } : type === "button" ? { action, statusId: action === "status" ? statusId : undefined, buttonLabel: label || undefined } : null;
  const problem = type === "formula" && formula ? formulaProblem(formula) : null;
  return (
    <ActionForm action={saveFieldAction} onSuccess={onDone} className="min-w-0 space-y-3 rounded-xl border border-line bg-subtle p-4">
      <input type="hidden" name="spaceId" value={spaceId} />
      <input type="hidden" name="type" value={type} />
      {field && <input type="hidden" name="fieldId" value={field.id} />}
      {config && <input type="hidden" name="config" value={JSON.stringify(config)} />}
      <div className="flex items-center gap-2.5">
        <span className="grid size-9 place-items-center rounded-xl bg-electric-soft text-electric">
          <Icon className="size-5" />
        </span>
        <div>
          <div className="font-display text-[15px] font-bold">{FIELD_TYPES[type].label}</div>
          <div className="text-[12.5px] text-muted">{FIELD_TYPES[type].hint}</div>
        </div>
      </div>
      <label className="block text-[13px] font-medium text-ink-2">
        Column name
        <input name="name" defaultValue={field?.name ?? ""} required maxLength={40} placeholder={PLACEHOLDER[type] ?? "e.g. Budget"} className="field mt-1" autoFocus={!!field} />
      </label>

      {(type === "dropdown" || type === "labels") && (
        <label className="block text-[13px] font-medium text-ink-2">
          Options <span className="font-normal text-muted">(one per line, each gets a colour)</span>
          <textarea name="options" rows={5} defaultValue={field?.options.map((o) => o.label).join("\n") ?? ""} required placeholder={"Instagram\nTikTok\nFacebook"} className="field mt-1 resize-y" />
        </label>
      )}

      {type === "formula" && (
        <div className="space-y-2">
          <label className="block text-[13px] font-medium text-ink-2">
            Formula
            <input value={formula} onChange={(e) => setFormula(e.target.value)} placeholder="{Budget} * 1.14" className={clsx("field mt-1 font-mono", problem && "border-bad")} />
          </label>
          {numeric.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              <span className="text-[12px] text-muted">Tap to insert:</span>
              {numeric.map((f) => (
                <button key={f.id} type="button" onClick={() => setFormula((x) => `${x}${x && !/[\s(+\-*/]$/.test(x) ? " " : ""}{${f.name}}`)} className="rounded-md border border-line bg-surface px-2 py-0.5 font-mono text-[12px] hover:border-electric hover:text-electric">
                  {`{${f.name}}`}
                </button>
              ))}
              {["+", "-", "*", "/", "(", ")"].map((op) => (
                <button key={op} type="button" onClick={() => setFormula((x) => `${x} ${op} `.replace(/\s+/g, " "))} className="w-7 rounded-md border border-line bg-surface py-0.5 font-mono text-[12px] hover:border-electric">
                  {op}
                </button>
              ))}
            </div>
          ) : (
            <p className="text-[12.5px] text-warn">Add a Number or Money column first, then use it here.</p>
          )}
          {problem && <p className="text-[12.5px] font-medium text-bad">{problem}</p>}
        </div>
      )}

      {type === "rollup" && (
        <div className="grid gap-2 sm:grid-cols-3">
          <label className="text-[13px] font-medium text-ink-2">
            Linked tasks from
            <select value={rel} onChange={(e) => setRel(e.target.value)} className="field mt-1">
              <option value="">Pick…</option>
              {relations.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-[13px] font-medium text-ink-2">
            Do
            <select value={fn} onChange={(e) => setFn(e.target.value as typeof fn)} className="field mt-1">
              <option value="sum">Sum</option>
              <option value="avg">Average</option>
              <option value="min">Lowest</option>
              <option value="max">Highest</option>
              <option value="count">Count tasks</option>
            </select>
          </label>
          {fn !== "count" && (
            <label className="text-[13px] font-medium text-ink-2">
              Of the column
              <select value={target} onChange={(e) => setTarget(e.target.value)} className="field mt-1">
                <option value="">Pick…</option>
                {numeric
                  .filter((f) => ["number", "money", "rating", "progress"].includes(f.type))
                  .map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
              </select>
            </label>
          )}
          {!relations.length && <p className="text-[12.5px] text-warn sm:col-span-3">Add a Relationship column first (it links tasks), then roll up their numbers here.</p>}
        </div>
      )}

      {type === "button" && (
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="text-[13px] font-medium text-ink-2">
            One click…
            <select value={action} onChange={(e) => setAction(e.target.value as typeof action)} className="field mt-1">
              <option value="done">Marks the task done</option>
              <option value="status">Moves it to a status</option>
              <option value="take">Gives it to me</option>
            </select>
          </label>
          {action === "status" && (
            <label className="text-[13px] font-medium text-ink-2">
              Status
              <select value={statusId} onChange={(e) => setStatusId(e.target.value)} className="field mt-1">
                {statuses.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="text-[13px] font-medium text-ink-2 sm:col-span-2">
            Button text <span className="font-normal text-muted">(optional)</span>
            <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={24} placeholder="e.g. Approve" className="field mt-1" />
          </label>
        </div>
      )}

      {HELP[type] && <p className="rounded-lg bg-surface px-3 py-2 text-[12.5px] text-muted ring-1 ring-line">{HELP[type]}</p>}

      <div className="flex justify-end gap-2 pt-1">
        <button type="button" onClick={onDone} className="h-9 cursor-pointer rounded-lg px-3 text-[14px] font-medium text-ink-2 hover:bg-hover">
          Cancel
        </button>
        <Submit disabled={!!problem}>{field ? "Save column" : "Add column"}</Submit>
      </div>
    </ActionForm>
  );
}

const PLACEHOLDER: Partial<Record<FieldType, string>> = {
  textarea: "e.g. Notes",
  money: "e.g. Budget",
  number: "e.g. Followers",
  date: "e.g. Launch day",
  dropdown: "e.g. Channel",
  labels: "e.g. Platforms",
  rating: "e.g. Quality",
  voting: "e.g. Team vote",
  person: "e.g. Reviewer",
  location: "e.g. Shoot location",
  signature: "e.g. Client sign-off",
  button: "e.g. Approve",
  formula: "e.g. Total with VAT",
  relationship: "e.g. Related tasks",
  rollup: "e.g. Total budget",
  tasks: "e.g. Checklist",
  progress_auto: "e.g. Progress",
  files: "e.g. Files",
};

const HELP: Partial<Record<FieldType, string>> = {
  voting: "Everyone taps once to vote and again to take it back. The count and the names show on the task.",
  signature: "People sign with their own name; the time is saved. Only who signed (or the space's admins) can remove it.",
  progress_auto: "Fills up by itself as the task's subtasks are finished.",
  tasks: "Shows how many subtasks are done, like 3/5.",
  files: "Shows how many files are attached to the task.",
  relationship: "Link a task to other tasks in this space (a campaign to its posts, a client to its requests…).",
  location: "Shows as a link that opens Google Maps.",
};
