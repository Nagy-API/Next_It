"use client";

import { useState } from "react";
import clsx from "clsx";
import { Check, Globe2, Lock, Zap } from "lucide-react";
import { createSpaceAction } from "@/app/space-actions";
import { ActionForm, Submit } from "@/components/client";
import { Avatar } from "@/components/avatar";
import { SPACE_COLORS } from "@/domain/spaces";

type T = { key: string; name: string; icon: string; color: string; description: string; statuses: { name: string; color: string }[]; fields: string[]; automations: string[] };

const ICONS = ["✅", "📣", "🧑‍💼", "💼", "🎬", "🎧", "🛠️", "📸", "🎨", "📦", "💡", "🚀", "📊", "🏷️", "🤝", "🗓️"];

export function NewSpaceForm({ templates, people, brands }: { templates: T[]; people: { id: string; name: string }[]; brands: { id: string; name: string }[] }) {
  const [tpl, setTpl] = useState(templates[0]);
  const [name, setName] = useState("");
  const [icon, setIcon] = useState(templates[0].icon);
  const [color, setColor] = useState(templates[0].color);
  const [priv, setPriv] = useState(false);
  return (
    <ActionForm action={createSpaceAction} className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="space-y-3">
        <div className="eyebrow">1. Start from</div>
        <div className="grid gap-3 sm:grid-cols-2">
          {templates.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => {
                setTpl(t);
                setIcon(t.icon);
                setColor(t.color);
              }}
              aria-pressed={tpl.key === t.key}
              className={clsx("relative cursor-pointer rounded-2xl border bg-white p-4 text-left transition-[border-color,box-shadow,transform] hover:-translate-y-0.5", tpl.key === t.key ? "border-electric shadow-[0_0_0_3px_rgb(59_130_246/0.15)]" : "border-line hover:border-line-strong")}
            >
              {tpl.key === t.key && <Check className="absolute right-3 top-3 size-4 text-electric" strokeWidth={3} />}
              <div className="flex items-center gap-2.5">
                <span className="grid size-9 place-items-center rounded-xl text-[18px]" style={{ background: `color-mix(in srgb, ${t.color} 15%, white)` }}>
                  {t.icon}
                </span>
                <span className="font-display text-[15px] font-bold">{t.name}</span>
              </div>
              <p className="mt-2 text-[12.5px] text-muted">{t.description}</p>
              <div className="mt-3 flex flex-wrap gap-1">
                {t.statuses.map((s) => (
                  <span key={s.name} className="rounded-full px-1.5 py-0.5 text-[10.5px] font-semibold" style={{ background: `color-mix(in srgb, ${s.color} 15%, white)`, color: `color-mix(in srgb, ${s.color} 80%, black)` }}>
                    {s.name}
                  </span>
                ))}
              </div>
              {t.automations.length > 0 && (
                <div className="mt-2 flex items-start gap-1 text-[11.5px] text-ink-2">
                  <Zap className="mt-0.5 size-3 shrink-0 text-amber-500" /> {t.automations.length} automation{t.automations.length > 1 ? "s" : ""} included
                </div>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-4 lg:sticky lg:top-24 lg:self-start">
        <div className="eyebrow">2. Name it</div>
        <div className="card space-y-4 p-5">
          <input type="hidden" name="template" value={tpl.key} />
          <input type="hidden" name="icon" value={icon} />
          <input type="hidden" name="color" value={color} />
          <input type="hidden" name="private" value={priv ? "1" : "0"} />
          <div className="flex items-center gap-3">
            <span className="grid size-12 shrink-0 place-items-center rounded-2xl text-[24px]" style={{ background: `color-mix(in srgb, ${color} 18%, white)` }}>
              {icon}
            </span>
            <div className="min-w-0 flex-1">
              <label className="label" htmlFor="sp-name">
                Space name
              </label>
              <input id="sp-name" name="name" required value={name} onChange={(e) => setName(e.target.value)} placeholder={`e.g. ${tpl.name}`} className="field w-full" autoFocus />
            </div>
          </div>
          <div>
            <div className="label">Icon & colour</div>
            <div className="flex flex-wrap gap-1">
              {ICONS.map((i) => (
                <button key={i} type="button" onClick={() => setIcon(i)} className={clsx("grid size-8 cursor-pointer place-items-center rounded-lg text-[16px] transition-colors", icon === i ? "bg-electric-soft ring-2 ring-electric/40" : "hover:bg-canvas")} aria-label={`Icon ${i}`}>
                  {i}
                </button>
              ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {SPACE_COLORS.map((c) => (
                <button key={c} type="button" onClick={() => setColor(c)} className={clsx("size-6 cursor-pointer rounded-full transition-transform hover:scale-110", color === c && "ring-2 ring-ink ring-offset-2")} style={{ background: c }} aria-label={`Colour ${c}`} />
              ))}
            </div>
          </div>
          <div>
            <div className="label">Who can see it</div>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  [false, Globe2, "Everyone", "The whole team"],
                  [true, Lock, "Private", "Only the people you add"],
                ] as const
              ).map(([v, Icon, l, h]) => (
                <button key={l} type="button" onClick={() => setPriv(v)} className={clsx("cursor-pointer rounded-xl border p-2.5 text-left transition-colors", priv === v ? "border-electric bg-electric-soft/50" : "border-line hover:border-line-strong")}>
                  <div className="flex items-center gap-1.5 text-[13.5px] font-semibold">
                    <Icon className="size-4" /> {l}
                  </div>
                  <div className="text-[11.5px] text-muted">{h}</div>
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="label">{priv ? "Members" : "Members"} <span className="font-normal text-muted">(you&rsquo;re the admin)</span></div>
            <div className="flex max-h-[150px] flex-wrap gap-1.5 overflow-y-auto">
              {people.map((p) => (
                <label key={p.id} className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-line py-0.5 pl-0.5 pr-2.5 text-[13px] has-[:checked]:border-electric has-[:checked]:bg-electric-soft">
                  <input type="checkbox" name="memberIds" value={p.id} className="sr-only" />
                  <Avatar name={p.name} size={22} badge={false} /> {p.name}
                </label>
              ))}
            </div>
          </div>
          {brands.length > 0 && (
            <div>
              <label className="label" htmlFor="sp-brand">
                For a brand <span className="font-normal text-muted">(optional)</span>
              </label>
              <select id="sp-brand" name="brandId" className="field w-full">
                <option value="">Not for a brand</option>
                {brands.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <Submit size="lg" className="w-full">
            Create {name.trim() || "the space"}
          </Submit>
        </div>
      </div>
    </ActionForm>
  );
}
