"use client";

import { useState } from "react";
import { KeyRound, Pencil, Plus } from "lucide-react";
import {
  changeOwnPasswordAction,
  createBrandAction,
  createPlatformAction,
  createUserAction,
  resetPasswordAction,
  setBrandActiveAction,
  setUserActiveAction,
  updateBrandAction,
  updatePlatformAction,
  updateUserAction,
} from "@/app/actions";
import { ActionForm, AutoSelect, Popover, Submit } from "@/components/client";
import { btn } from "@/components/ui";
import { TEAMS } from "@/db/schema";
import { TEAM_META } from "@/domain/workflow";

type P = { id: string; name: string };

/* ------------------------------ Brands ------------------------------ */

export function NewBrandForm({ people }: { people: P[] }) {
  return (
    <ActionForm action={createBrandAction} resetOnSuccess className="card flex flex-wrap items-end gap-3 p-4">
      <div className="min-w-[220px] flex-1">
        <label className="label">New brand</label>
        <input name="name" required placeholder="Brand name" className="field" />
      </div>
      <div className="w-[200px]">
        <label className="label">Default content creator</label>
        <select name="defaultCreatorId" className="field">
          <option value="">Nobody</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      <Submit>
        <Plus className="size-4" /> Add brand
      </Submit>
    </ActionForm>
  );
}

export function BrandCreatorSelect({ brandId, value, people }: { brandId: string; value: string | null; people: P[] }) {
  return <BrandDefaultSelect brandId={brandId} field="defaultCreatorId" value={value} people={people} label="Default content creator" />;
}

/** Auto-saving "default person" picker for one team on one brand. */
export function BrandDefaultSelect({ brandId, field, value, people, label, empty = "Nobody" }: { brandId: string; field: "defaultCreatorId" | "defaultShootId" | "defaultMediaId" | "defaultDesignId" | "defaultSocialId"; value: string | null; people: P[]; label: string; empty?: string }) {
  return (
    <ActionForm action={updateBrandAction} inlineError={false}>
      <input type="hidden" name="brandId" value={brandId} />
      <AutoSelect name={field} defaultValue={value ?? ""} key={value ?? ""} className="w-full" aria-label={label}>
        <option value="">{empty}</option>
        {people.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </AutoSelect>
    </ActionForm>
  );
}

export function BrandEdit({ brandId, name, color }: { brandId: string; name: string; color: string }) {
  return (
    <Popover align="right" width={300} triggerClassName={btn("ghost", "sm")} trigger={<Pencil className="size-3.5" />} label="Edit brand">
      {(close) => (
        <ActionForm action={updateBrandAction} onSuccess={close} className="space-y-3">
          <input type="hidden" name="brandId" value={brandId} />
          <div>
            <label className="label" htmlFor={`bn-${brandId}`}>
              Name
            </label>
            <input id={`bn-${brandId}`} name="name" defaultValue={name} required className="field" />
          </div>
          <div>
            <label className="label" htmlFor={`bc-${brandId}`}>
              Calendar color
            </label>
            <input id={`bc-${brandId}`} type="color" name="color" defaultValue={color} className="h-9 w-full cursor-pointer rounded-lg border border-line" />
          </div>
          <Submit className="w-full">Save</Submit>
        </ActionForm>
      )}
    </Popover>
  );
}

export function BrandActiveToggle({ brandId, active }: { brandId: string; active: boolean }) {
  return (
    <ActionForm action={setBrandActiveAction} inlineError={false}>
      <input type="hidden" name="brandId" value={brandId} />
      <input type="hidden" name="active" value={active ? "0" : "1"} />
      <Submit variant={active ? "ghost" : "secondary"} size="sm">
        {active ? "Make inactive" : "Reactivate"}
      </Submit>
    </ActionForm>
  );
}

/* ------------------------------ Platforms ---------------------------- */

export function NewPlatformForm() {
  return (
    <ActionForm action={createPlatformAction} resetOnSuccess className="card flex items-end gap-3 p-4">
      <div className="flex-1">
        <label className="label">New platform</label>
        <input name="name" required placeholder="e.g. YouTube Shorts" className="field" />
      </div>
      <Submit>
        <Plus className="size-4" /> Add
      </Submit>
    </ActionForm>
  );
}

export function PlatformControls({ id, name, active }: { id: string; name: string; active: boolean }) {
  return (
    <div className="flex items-center gap-1">
      <Popover align="right" width={260} triggerClassName={btn("ghost", "sm")} trigger={<Pencil className="size-3.5" />} label="Rename">
        {(close) => (
          <ActionForm action={updatePlatformAction} onSuccess={close} className="space-y-3">
            <input type="hidden" name="platformId" value={id} />
            <input name="name" defaultValue={name} required className="field" />
            <Submit className="w-full">Rename</Submit>
          </ActionForm>
        )}
      </Popover>
      <ActionForm action={updatePlatformAction} inlineError={false}>
        <input type="hidden" name="platformId" value={id} />
        <input type="hidden" name="active" value={active ? "0" : "1"} />
        <Submit variant={active ? "ghost" : "secondary"} size="sm">
          {active ? "Disable" : "Enable"}
        </Submit>
      </ActionForm>
    </div>
  );
}

/* ------------------------------- People ------------------------------ */

function TeamChecks({ value }: { value: string[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {TEAMS.map((t) => (
        <label key={t} className="flex cursor-pointer items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-[12.5px] has-[:checked]:border-electric has-[:checked]:bg-electric-soft has-[:checked]:text-[#1d5fd1]">
          <input type="checkbox" name="teams" value={t} defaultChecked={value.includes(t)} className="sr-only" />
          {TEAM_META[t].label}
        </label>
      ))}
    </div>
  );
}

export function NewUserForm({ roles }: { roles: boolean }) {
  const [open, setOpen] = useState(false);
  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className={btn("primary")}>
        <Plus className="size-4" /> New account
      </button>
    );
  return (
    <ActionForm action={createUserAction} onSuccess={() => setOpen(false)} className="card w-full space-y-4 p-5">
      <div className="font-display text-[15px] font-bold">New account</div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="nu-name">Name</label>
          <input id="nu-name" name="name" required className="field" placeholder="e.g. Mariam" />
        </div>
        <div>
          <label className="label" htmlFor="nu-username">Username (for signing in)</label>
          <input id="nu-username" name="username" required className="field" placeholder="e.g. mariam" autoCapitalize="none" />
        </div>
        <div>
          <label className="label" htmlFor="nu-title">Job title</label>
          <input id="nu-title" name="title" className="field" placeholder="e.g. Video Editor" />
        </div>
        <div>
          <label className="label" htmlFor="nu-password">Temporary password (10+ characters)</label>
          <input id="nu-password" name="password" type="text" required minLength={10} className="field" autoComplete="off" />
          <p className="mt-1 text-[12px] text-muted">They&rsquo;ll be asked to choose their own at first sign-in.</p>
        </div>
      </div>
      <div>
        <div className="label">Teams (someone can be in more than one)</div>
        <TeamChecks value={[]} />
      </div>
      {roles && (
        <>
          <input type="hidden" name="roles" value="1" />
          <label className="flex items-center gap-2 text-[13.5px]">
            <input type="checkbox" name="isManager" value="1" className="size-4 accent-[var(--color-electric)]" /> Manager (gives tasks, sets deadlines, sees the dashboard & activity log)
          </label>
          <label className="flex items-center gap-2 text-[13.5px]">
            <input type="checkbox" name="isAdmin" value="1" className="size-4 accent-[var(--color-electric)]" /> Admin: full access (CEO / IT)
          </label>
          <p className="text-[12px] text-muted">Fine-tune exactly what anyone can do in Settings → Access.</p>
        </>
      )}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => setOpen(false)} className={btn("ghost")}>
          Cancel
        </button>
        <Submit>Create account</Submit>
      </div>
    </ActionForm>
  );
}

export function EditUser({ u, roles }: { u: { id: string; name: string; title: string | null; teams: string[]; isAdmin: boolean; isManager: boolean; roleLabel: string | null }; roles: boolean }) {
  return (
    <Popover align="right" width={380} triggerClassName={btn("ghost", "sm")} trigger={<><Pencil className="size-3.5" /> Edit</>}>
      {(close) => (
        <ActionForm action={updateUserAction} onSuccess={close} className="space-y-3">
          <input type="hidden" name="userId" value={u.id} />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label">Name</label>
              <input name="name" defaultValue={u.name} required className="field" />
            </div>
            <div>
              <label className="label">Title</label>
              <input name="title" defaultValue={u.title ?? ""} className="field" />
            </div>
          </div>
          <div>
            <div className="label">Teams</div>
            <TeamChecks value={u.teams} />
          </div>
          {roles && (
            <>
              <input type="hidden" name="roles" value="1" />
              <label className="flex items-center gap-2 text-[13.5px]">
                <input type="checkbox" name="isManager" value="1" defaultChecked={u.isManager} className="size-4 accent-[var(--color-electric)]" /> Manager
              </label>
              <label className="flex items-center gap-2 text-[13.5px]">
                <input type="checkbox" name="isAdmin" value="1" defaultChecked={u.isAdmin} className="size-4 accent-[var(--color-electric)]" /> Admin: full access
              </label>
              <div>
                <label className="label">Role label <span className="font-normal text-muted">(optional, shown instead of &ldquo;Manager&rdquo;)</span></label>
                <input name="roleLabel" defaultValue={u.roleLabel ?? ""} maxLength={20} placeholder="e.g. IT, CEO, Team lead" className="field" />
              </div>
            </>
          )}
          <Submit className="w-full">Save</Submit>
        </ActionForm>
      )}
    </Popover>
  );
}

export function ResetPassword({ userId, name }: { userId: string; name: string }) {
  return (
    <Popover align="right" width={300} triggerClassName={btn("ghost", "sm")} trigger={<><KeyRound className="size-3.5" /> Password</>}>
      {(close) => (
        <ActionForm action={resetPasswordAction} onSuccess={close} className="space-y-3">
          <input type="hidden" name="userId" value={userId} />
          <label className="label">New password for {name}</label>
          <input name="password" type="text" minLength={10} required className="field" autoComplete="off" />
          <p className="text-[12px] text-muted">A temporary password: they&rsquo;re signed out everywhere and choose their own at next sign-in.</p>
          <Submit className="w-full">Reset password</Submit>
        </ActionForm>
      )}
    </Popover>
  );
}

export function UserActiveToggle({ userId, active }: { userId: string; active: boolean }) {
  return (
    <ActionForm action={setUserActiveAction} inlineError={false}>
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="active" value={active ? "0" : "1"} />
      <Submit variant={active ? "ghost" : "secondary"} size="sm">
        {active ? "Deactivate" : "Reactivate"}
      </Submit>
    </ActionForm>
  );
}

/* ------------------------------ Account ------------------------------ */

export function ChangePasswordForm() {
  return (
    <ActionForm action={changeOwnPasswordAction} resetOnSuccess className="card max-w-md space-y-3 p-5">
      <div>
        <label className="label" htmlFor="pw-current">
          Current password
        </label>
        <input id="pw-current" name="current" type="password" required autoComplete="current-password" className="field" />
      </div>
      <div>
        <label className="label" htmlFor="pw-new">
          New password
        </label>
        <input id="pw-new" name="password" type="password" required minLength={10} autoComplete="new-password" className="field" />
        <p className="mt-1 text-[12px] text-muted">At least 10 characters, letters mixed with numbers or symbols. Not your username.</p>
      </div>
      <div>
        <label className="label" htmlFor="pw-confirm">
          Repeat new password
        </label>
        <input id="pw-confirm" name="confirm" type="password" required minLength={10} autoComplete="new-password" className="field" />
      </div>
      <Submit>Change password</Submit>
    </ActionForm>
  );
}
