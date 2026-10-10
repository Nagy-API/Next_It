"use client";

import { saveDashboardAction, archiveDashboardAction } from "@/app/space-actions";
import { ActionForm, Submit } from "@/components/client";
import { Trash2 } from "lucide-react";

export type ScopeOption = { value: string; label: string };

export function DashboardForm({ scopes, widgets, initial }: { scopes: ScopeOption[]; widgets: { key: string; label: string; hint: string }[]; initial?: { id: string; name: string; scope: string; widgets: string[]; shared: boolean } }) {
  return (
    <ActionForm action={saveDashboardAction} className="space-y-4">
      {initial && <input type="hidden" name="dashboardId" value={initial.id} />}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="db-name">
            Name
          </label>
          <input id="db-name" name="name" required maxLength={60} defaultValue={initial?.name ?? ""} placeholder="e.g. HR this month" className="field w-full" />
        </div>
        <div>
          <label className="label" htmlFor="db-scope">
            What to count
          </label>
          <select id="db-scope" name="scope" defaultValue={initial?.scope ?? ""} className="field w-full">
            {scopes.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <div className="label">Cards</div>
        <div className="grid gap-2 sm:grid-cols-3">
          {widgets.map((w) => (
            <label key={w.key} className="flex cursor-pointer items-start gap-2 rounded-xl border border-line bg-surface p-2.5 has-[:checked]:border-electric has-[:checked]:bg-electric-soft/40">
              <input type="checkbox" name="widgets" value={w.key} defaultChecked={initial ? initial.widgets.includes(w.key) : ["summary", "status", "people", "overdue"].includes(w.key)} className="mt-0.5 size-4 accent-[var(--color-electric)]" />
              <span>
                <span className="block text-[13.5px] font-semibold">{w.label}</span>
                <span className="block text-[12px] text-muted">{w.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </div>
      <label className="flex items-center gap-2 text-[13.5px]">
        <input type="checkbox" name="shared" value="1" defaultChecked={initial?.shared ?? true} className="size-4 accent-[var(--color-electric)]" /> Shared with the team (everyone sees only what they&rsquo;re allowed to)
      </label>
      <Submit>{initial ? "Save dashboard" : "Create dashboard"}</Submit>
    </ActionForm>
  );
}

export function DeleteDashboard({ id }: { id: string }) {
  return (
    <ActionForm action={archiveDashboardAction} inlineError={false}>
      <input type="hidden" name="dashboardId" value={id} />
      <button type="submit" onClick={(e) => !confirm("Delete this dashboard? The tasks aren't touched.") && e.preventDefault()} className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium text-muted hover:bg-bad-soft hover:text-bad">
        <Trash2 className="size-4" /> Delete
      </button>
    </ActionForm>
  );
}
