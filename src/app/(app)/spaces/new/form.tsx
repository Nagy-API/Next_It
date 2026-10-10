"use client";

import { useState } from "react";
import clsx from "clsx";
import { Globe2, Lock } from "lucide-react";
import { createSpaceAction } from "@/app/space-actions";
import { ActionForm, Submit } from "@/components/client";
import { Avatar } from "@/components/avatar";
import { SPACE_COLORS } from "@/domain/spaces";

const ICONS = ["✅", "📣", "🧑‍💼", "💼", "🎬", "🎧", "🛠️", "📸", "🎨", "📦", "💡", "🚀", "📊", "🏷️", "🤝", "🗓️"];

/** The right side of the template library when making a space: name, icon & colour, who sees it, members, brand. */
export function NewSpaceFields({ template: tpl, people, brands }: { template: { key: string; name: string; icon: string; color: string }; people: { id: string; name: string }[]; brands: { id: string; name: string }[] }) {
  const [name, setName] = useState("");
  const [icon, setIcon] = useState(tpl.icon);
  const [color, setColor] = useState(tpl.color);
  const [priv, setPriv] = useState(false);
  return (
    <ActionForm action={createSpaceAction}>
      <div className="space-y-4">
        <div className="card space-y-4 p-5">
          <input type="hidden" name="template" value={tpl.key} />
          <input type="hidden" name="icon" value={icon} />
          <input type="hidden" name="color" value={color} />
          <input type="hidden" name="private" value={priv ? "1" : "0"} />
          <div className="flex items-center gap-3">
            <span className="grid size-12 shrink-0 place-items-center rounded-2xl text-[24px]" style={{ background: `color-mix(in srgb, ${color} 18%, var(--color-surface))` }}>
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
