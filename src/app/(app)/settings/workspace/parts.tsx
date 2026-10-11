"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { ImagePlus, Loader2, RotateCcw } from "lucide-react";
import { setWorkspaceImageAction, updateWorkspaceAction } from "@/app/actions";
import { ActionForm, Submit, useToast } from "@/components/client";

const PRESETS = [
  { name: "NEXORA", primary: "#3b82f6", dark: "#0b1639" },
  { name: "Emerald", primary: "#10b981", dark: "#062925" },
  { name: "Violet", primary: "#8b5cf6", dark: "#1a1033" },
  { name: "Sunset", primary: "#f97316", dark: "#2a1208" },
  { name: "Rose", primary: "#e11d74", dark: "#2a0a1c" },
  { name: "Graphite", primary: "#0ea5e9", dark: "#111827" },
];

/** The two brand colours, with a live preview of the sidebar, a button and a chip. */
export function ColorsForm({ primary, dark }: { primary: string; dark: string }) {
  const [p, setP] = useState(primary);
  const [d, setD] = useState(dark);
  return (
    <ActionForm action={updateWorkspaceAction} className="grid gap-5 md:grid-cols-[minmax(0,1fr)_260px]">
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((x) => (
            <button
              key={x.name}
              type="button"
              onClick={() => {
                setP(x.primary);
                setD(x.dark);
              }}
              className={clsx("inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12.5px] font-medium transition-colors", p === x.primary && d === x.dark ? "border-ink text-ink" : "border-line text-ink-2 hover:border-ink-2")}
            >
              <span className="flex">
                <span className="size-3.5 rounded-full ring-2 ring-surface" style={{ background: x.dark }} />
                <span className="-ml-1 size-3.5 rounded-full ring-2 ring-surface" style={{ background: x.primary }} />
              </span>
              {x.name}
            </button>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <ColorField label="Main colour" hint="Buttons, links, highlights" name="primary" value={p} onChange={setP} />
          <ColorField label="Dark colour" hint="Sidebar, headings, text" name="dark" value={d} onChange={setD} />
        </div>
        <Submit>Save colours</Submit>
      </div>
      <div aria-hidden className="overflow-hidden rounded-xl border border-line">
        <div className="flex h-[150px]">
          <div className="w-[90px] space-y-1.5 p-2.5" style={{ background: d }}>
            <div className="h-2 w-12 rounded bg-white/70" />
            <div className="mt-3 h-5 rounded-md" style={{ background: p }} />
            <div className="h-2 w-14 rounded bg-white/25" />
            <div className="h-2 w-10 rounded bg-white/25" />
          </div>
          <div className="flex-1 space-y-2 bg-canvas p-3">
            <div className="h-2.5 w-24 rounded" style={{ background: d }} />
            <div className="h-2 w-32 rounded bg-track" />
            <div className="inline-flex rounded-md px-2.5 py-1 text-[11px] font-semibold text-white" style={{ background: p }}>
              Button
            </div>
            <div className="inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: `color-mix(in srgb, ${p} 12%, var(--color-surface))`, color: p }}>
              In progress
            </div>
          </div>
        </div>
        <div className="border-t border-line bg-surface px-3 py-1.5 text-[11.5px] text-muted">Preview</div>
      </div>
    </ActionForm>
  );
}

function ColorField({ label, hint, name, value, onChange }: { label: string; hint: string; name: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="label" htmlFor={`c-${name}`}>
        {label} <span className="font-normal text-muted">· {hint}</span>
      </label>
      <div className="flex items-center gap-2">
        <input type="color" aria-label={`${label} picker`} value={/^#[0-9a-f]{6}$/i.test(value) ? value : "#000000"} onChange={(e) => onChange(e.target.value)} className="h-10 w-12 cursor-pointer rounded-lg border border-line bg-surface p-1" />
        <input id={`c-${name}`} name={name} value={value} onChange={(e) => onChange(e.target.value)} pattern="#[0-9a-fA-F]{6}" required className="field font-mono" />
      </div>
    </div>
  );
}

/** Fit an image (not cropped) into w×h as a PNG with a transparent background. */
async function toPng(file: File, maxW: number, maxH: number): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("That file isn't an image."));
      i.src = url;
    });
    const scale = Math.min(1, maxW / img.naturalWidth, maxH / img.naturalHeight);
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** One logo slot: preview on its real background, upload, back to the built-in one. */
export function ImageSlot({ k, label, hint, src, custom, dark, box }: { k: string; label: string; hint: string; src: string; custom: boolean; dark: boolean; box: [number, number] }) {
  const input = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  const save = (data: string) =>
    start(async () => {
      const fd = new FormData();
      fd.set("key", k);
      fd.set("data", data);
      const r = await setWorkspaceImageAction(null, fd);
      if (r && !r.ok) toast({ kind: "error", text: r.error });
      else toast({ kind: "ok", text: r?.ok ? (r.message ?? "Saved.") : "Saved." });
      router.refresh();
    });
  return (
    <div className="rounded-xl border border-line bg-surface p-3">
      {/* The picture is pinned inside its box (absolute + object-contain): any size or shape stays inside and never covers the text. */}
      <div className={clsx("relative h-24 overflow-hidden rounded-lg ring-1 ring-inset ring-line", dark ? "bg-navy-900" : "bg-[#f4f6fb]")}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="" className="absolute inset-3 m-auto h-[calc(100%-1.5rem)] w-[calc(100%-1.5rem)] object-contain" />
      </div>
      <div className="mt-2.5 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-[140px] flex-1">
          <div className="text-[13.5px] font-semibold text-ink">{label}</div>
          <div className="text-[12px] text-muted">{custom ? "Your upload" : "Built in"} · {hint}</div>
        </div>
        <div className="flex shrink-0 gap-1">
          <input
            ref={input}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            aria-label={`Upload ${label}`}
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              try {
                save(await toPng(f, box[0], box[1]));
              } catch (err) {
                toast({ kind: "error", text: (err as Error).message });
              }
            }}
          />
          <button type="button" disabled={pending} onClick={() => input.current?.click()} className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-line px-2 py-1 text-[12.5px] font-medium text-ink-2 hover:border-electric hover:text-electric">
            {pending ? <Loader2 className="size-3.5 animate-spin" /> : <ImagePlus className="size-3.5" />} Upload
          </button>
          {custom && (
            <button type="button" disabled={pending} onClick={() => save("")} className="cursor-pointer rounded-lg p-1.5 text-faint hover:bg-canvas hover:text-ink" title="Back to the built-in image" aria-label={`Reset ${label}`}>
              <RotateCcw className="size-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

type WmMode = "logo" | "image" | "none";

/** Watermark: one for light mode and one for dark mode (a navy mark vanishes on dark, a white one on light). */
export function WatermarkForm({ light, dark }: { light: { mode: WmMode; opacity: number; logo: string; image: string }; dark: { mode: WmMode; opacity: number; logo: string; image: string } }) {
  return (
    <ActionForm action={updateWorkspaceAction} className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <WatermarkSide title="Light mode" name="watermark" opName="watermarkOpacity" upload="Watermark image" {...light} canvas="#f4f6fb" />
        <WatermarkSide title="Dark mode" name="watermarkDark" opName="watermarkDarkOpacity" upload="Watermark image (dark mode)" {...dark} canvas="#0a1022" />
      </div>
      <p className="text-[12px] text-muted">Shown faintly behind every page on big screens. 3 to 8% is subtle. Each person sees the one for the theme they picked.</p>
      <Submit>Save watermark</Submit>
    </ActionForm>
  );
}

function WatermarkSide({ title, name, opName, upload, mode, opacity, logo, image, canvas }: { title: string; name: string; opName: string; upload: string; mode: WmMode; opacity: number; logo: string; image: string; canvas: string }) {
  const [m, setM] = useState(mode);
  const [o, setO] = useState(opacity || 5);
  const src = m === "image" ? image : logo;
  return (
    <div className="space-y-3 rounded-xl border border-line p-3.5">
      <div className="text-[13.5px] font-semibold text-ink">{title}</div>
      <div className="inline-flex flex-wrap rounded-xl border border-line bg-surface p-0.5" role="radiogroup" aria-label={`Watermark, ${title}`}>
        {(
          [
            ["logo", "Company symbol"],
            ["image", "Its own picture"],
            ["none", "None"],
          ] as const
        ).map(([v, l]) => (
          <label key={v} className={clsx("cursor-pointer rounded-[9px] px-3 py-1.5 text-[13px] font-medium", m === v ? "bg-electric-soft text-electric" : "text-muted hover:text-ink")}>
            <input type="radio" name={name} value={v} checked={m === v} onChange={() => setM(v)} className="sr-only" />
            {l}
          </label>
        ))}
      </div>
      {m !== "none" && (
        <div>
          <label className="label" htmlFor={`${name}-o`}>
            How visible: {o}%
          </label>
          <input id={`${name}-o`} type="range" name={opName} min={1} max={30} value={o} onChange={(e) => setO(Number(e.target.value))} className="w-full accent-[var(--color-electric)]" />
        </div>
      )}
      {m === "image" && <p className="text-[12.5px] text-ink-2">Upload the picture in &ldquo;{upload}&rdquo; above.</p>}
      <div aria-hidden className="relative grid h-[120px] place-items-center overflow-hidden rounded-lg border border-line" style={{ background: canvas }}>
        {m !== "none" && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt="" className="absolute -right-6 top-2 size-[130px] object-contain" style={{ opacity: o / 100 }} />
        )}
        <span className="relative text-[11.5px]" style={{ color: canvas === "#0a1022" ? "#94a3b8" : "#64748b" }}>
          Preview
        </span>
      </div>
    </div>
  );
}
