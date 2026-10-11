import { redirect } from "next/navigation";
import { Blocks, Building2, Clock4, Image as ImageIcon, Palette, Stamp } from "lucide-react";
import { updateWorkspaceAction } from "@/app/actions";
import { ActionForm, Submit } from "@/components/client";
import { can } from "@/domain/permissions";
import { requireUser } from "@/server/auth";
import { IMAGE_KEYS, MODULES, MODULE_KEYS, getWorkspace } from "@/server/settings";
import { ColorsForm, ImageSlot, WatermarkForm } from "./parts";

export const metadata = { title: "Workspace · Settings" };

export default async function WorkspaceSettings() {
  const me = await requireUser();
  if (!can.customizeWorkspace(me)) redirect("/settings/account");
  const ws = await getWorkspace();
  return (
    <div className="space-y-5">
      <p className="rounded-xl bg-electric-soft/70 px-3.5 py-2.5 text-[13px] text-ink-2">
        Make the system yours: name, colours, logos and what the team sees. Changes apply to everyone right away, no code needed. Only people with &ldquo;Customize the workspace&rdquo; (Settings → Access) see this page.
      </p>

      <Card icon={Building2} title="Name" hint="Shown on the sign-in page, the browser tab, reports and Excel files">
        <ActionForm action={updateWorkspaceAction} className="grid gap-3 sm:grid-cols-2">
          <Field name="name" label="Company name" value={ws.name} max={40} />
          <Field name="appName" label="System name (browser tab)" value={ws.appName} max={40} />
          <Field name="tagline" label="Tagline (sign-in page)" value={ws.tagline} max={60} />
          <Field name="adminContact" label="Who people ask for an account" value={ws.adminContact} max={80} />
          <div className="sm:col-span-2">
            <Submit>Save name</Submit>
          </div>
        </ActionForm>
      </Card>

      <Card icon={Palette} title="Colours" hint="Two colours re-colour the whole system">
        <ColorsForm primary={ws.primary} dark={ws.dark} />
      </Card>

      <Card icon={ImageIcon} title="Logos" hint="PNG with a transparent background looks best">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <ImageSlot k="wordmark" label={IMAGE_KEYS.wordmark} hint="sidebar & sign-in" src={ws.logos.wordmark} custom={ws.custom.wordmark} dark box={[640, 160]} />
          <ImageSlot k="mark" label={IMAGE_KEYS.mark} hint="next to the name" src={ws.logos.mark} custom={ws.custom.mark} dark box={[256, 256]} />
          <ImageSlot k="markLight" label={IMAGE_KEYS.markLight} hint="light pages" src={ws.logos.markLight} custom={ws.custom.markLight} dark={false} box={[256, 256]} />
          <ImageSlot k="watermark" label={IMAGE_KEYS.watermark} hint="behind the pages" src={ws.custom.watermark ? ws.logos.watermark : ws.logos.markLight} custom={ws.custom.watermark} dark={false} box={[512, 512]} />
          <ImageSlot k="watermarkDark" label={IMAGE_KEYS.watermarkDark} hint="behind the pages, dark mode" src={ws.logos.watermarkDark} custom={ws.custom.watermarkDark} dark box={[512, 512]} />
        </div>
      </Card>

      <Card icon={Stamp} title="Watermark" hint="The faint mark behind every page, one for light mode and one for dark mode">
        <WatermarkForm
          light={{ mode: ws.watermark, opacity: ws.watermarkOpacity, logo: ws.logos.markLight, image: ws.logos.watermark }}
          dark={{ mode: ws.watermarkDark, opacity: ws.watermarkDarkOpacity, logo: ws.logos.mark, image: ws.logos.watermarkDark }}
        />
      </Card>

      <Card icon={Blocks} title="Modules" hint="Turn off what your team doesn't use. Nothing is deleted; turning it back on brings everything back.">
        <ActionForm action={updateWorkspaceAction} className="space-y-3">
          <input type="hidden" name="modules" value="1" />
          <div className="grid gap-2 sm:grid-cols-2">
            {MODULE_KEYS.map((k) => (
              <label key={k} className="flex cursor-pointer items-start gap-3 rounded-xl border border-line bg-surface px-3.5 py-3 transition-colors hover:border-electric/50 has-[:checked]:border-electric/60 has-[:checked]:bg-electric-soft/40">
                <input type="checkbox" name={`module_${k}`} defaultChecked={ws.modules[k]} className="mt-0.5 size-4 accent-[var(--color-electric)]" />
                <span>
                  <span className="block text-[14px] font-semibold text-ink">{MODULES[k].label}</span>
                  <span className="block text-[12.5px] text-muted">{MODULES[k].hint}</span>
                </span>
              </label>
            ))}
          </div>
          <Submit>Save modules</Submit>
        </ActionForm>
      </Card>

      <Card icon={Clock4} title="Automatic pause" hint="A clock left running stops by itself, so a forgotten clock never counts the night">
        <ActionForm action={updateWorkspaceAction} className="flex flex-wrap items-end gap-3">
          <label className="flex items-center gap-2 pb-2.5 text-[14px]">
            <input type="checkbox" name="autoPauseOn" defaultChecked={!!ws.autoPauseAt} className="size-4 accent-[var(--color-electric)]" /> Pause running clocks at
          </label>
          <div>
            <label className="label" htmlFor="ap-at">
              Time (Cairo)
            </label>
            <input id="ap-at" type="time" name="autoPauseAt" defaultValue={ws.autoPauseAt || "21:00"} className="field w-[140px]" />
          </div>
          <Submit>Save</Submit>
          <p className="basis-full text-[12.5px] text-muted">The step shows &ldquo;Paused&rdquo;; the person presses In progress to continue. Clocks started after this time pause at midnight.</p>
        </ActionForm>
      </Card>
    </div>
  );
}

function Card({ icon: Icon, title, hint, children }: { icon: typeof Palette; title: string; hint: string; children: React.ReactNode }) {
  return (
    <section className="card p-5">
      <h2 className="flex flex-wrap items-center gap-2 font-display text-[16px] font-bold">
        <span className="grid size-7 place-items-center rounded-lg bg-electric-soft text-electric">
          <Icon className="size-4" />
        </span>
        {title}
      </h2>
      <p className="mb-4 mt-1 text-[12.5px] text-muted">{hint}</p>
      {children}
    </section>
  );
}

function Field({ name, label, value, max }: { name: string; label: string; value: string; max: number }) {
  return (
    <div>
      <label className="label" htmlFor={`ws-${name}`}>
        {label}
      </label>
      <input id={`ws-${name}`} name={name} defaultValue={value} maxLength={max} className="field" />
    </div>
  );
}
