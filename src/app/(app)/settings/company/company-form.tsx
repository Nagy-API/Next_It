"use client";

import { useState } from "react";
import { ImageUp, RotateCcw } from "lucide-react";
import { companyAction } from "@/app/actions";
import { ActionForm, Submit } from "@/components/client";
import { btn } from "@/components/ui";
import type { Branding } from "@/config/brand";

/** Read a picked image and shrink it (keeps transparency) so it's light to store and load. */
async function shrink(file: File, maxW: number, maxH: number): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, bad) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => bad(new Error("That file isn't an image."));
      i.src = url;
    });
    const scale = Math.min(1, maxW / img.naturalWidth, maxH / img.naturalHeight);
    const c = document.createElement("canvas");
    c.width = Math.round(img.naturalWidth * scale);
    c.height = Math.round(img.naturalHeight * scale);
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(url);
  }
}

function ImagePick({ name, label, hint, current, maxW, maxH, dark }: { name: string; label: string; hint: string; current: string; maxW: number; maxH: number; dark?: boolean }) {
  const [value, setValue] = useState<string | null>(null);
  const [err, setErr] = useState("");
  return (
    <div>
      <div className="label">{label}</div>
      <div className="flex flex-wrap items-center gap-3">
        <div className={dark ? "flex h-16 min-w-[140px] items-center justify-center rounded-xl bg-navy-900 px-4" : "flex size-16 items-center justify-center rounded-xl bg-navy-900 p-2"}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value ?? current} alt="" className="max-h-10 max-w-[200px] object-contain" />
        </div>
        <label className={btn("secondary", "sm", "cursor-pointer")}>
          <ImageUp className="size-4" /> Choose image
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              try {
                setErr("");
                setValue(await shrink(f, maxW, maxH));
              } catch (x) {
                setErr((x as Error).message);
              }
            }}
          />
        </label>
        {value && <input type="hidden" name={name} value={value} />}
      </div>
      <p className="mt-1 text-[12px] text-muted">{hint}</p>
      {err && <p className="mt-1 text-[12px] text-bad">{err}</p>}
    </div>
  );
}

export function CompanyForm({ brand }: { brand: Branding }) {
  const [primary, setPrimary] = useState(brand.primaryColor);
  const [dark, setDark] = useState(brand.darkColor);
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <ActionForm action={companyAction} className="card space-y-5 p-5">
        <div>
          <h2 className="font-display text-[16px] font-bold">Company & branding</h2>
          <p className="text-[13px] text-muted">Use this system for any company: change the name, colours and logo here — no code needed.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="co-name">
              Company name
            </label>
            <input id="co-name" name="name" defaultValue={brand.name} className="field" required />
          </div>
          <div>
            <label className="label" htmlFor="co-app">
              System name (browser tab)
            </label>
            <input id="co-app" name="appName" defaultValue={brand.appName} className="field" required />
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="co-admin">
              Who people ask for an account
            </label>
            <input id="co-admin" name="adminContact" defaultValue={brand.adminContact} className="field" placeholder="e.g. the CEO or IT" />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="co-primary">
              Main colour (buttons, highlights)
            </label>
            <div className="flex items-center gap-2">
              <input id="co-primary" type="color" name="primaryColor" value={primary} onChange={(e) => setPrimary(e.target.value)} className="h-10 w-14 cursor-pointer rounded-lg border border-line" />
              <code className="text-[13px] text-ink-2">{primary}</code>
            </div>
          </div>
          <div>
            <label className="label" htmlFor="co-dark">
              Dark colour (sidebar, text)
            </label>
            <div className="flex items-center gap-2">
              <input id="co-dark" type="color" name="darkColor" value={dark} onChange={(e) => setDark(e.target.value)} className="h-10 w-14 cursor-pointer rounded-lg border border-line" />
              <code className="text-[13px] text-ink-2">{dark}</code>
            </div>
          </div>
        </div>
        <ImagePick name="logo" label="Logo (light version for the dark sidebar)" hint="PNG with a transparent background works best. Wide logos are fine." current={brand.logoUrl} maxW={900} maxH={240} dark />
        <ImagePick name="mark" label="Icon / symbol" hint="A square symbol, used next to the logo and as a watermark." current={brand.markUrl} maxW={512} maxH={512} />
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line pt-4">
          <Submit>Save branding</Submit>
        </div>
      </ActionForm>

      <div className="space-y-4">
        <div className="card overflow-hidden">
          <div className="px-4 py-3 text-[12px] font-semibold uppercase tracking-wide text-muted">Preview</div>
          <div className="flex items-center gap-2.5 px-4 py-4" style={{ background: dark }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={brand.markUrl} alt="" className="size-7 object-contain" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={brand.logoUrl} alt="" className="h-[18px] w-auto" />
          </div>
          <div className="space-y-2 p-4">
            <span className="inline-flex rounded-lg px-3 py-2 text-[13px] font-semibold text-white" style={{ background: primary }}>
              Primary button
            </span>
            <p className="text-[13px]" style={{ color: dark }}>
              Headings and text use the dark colour.
            </p>
          </div>
        </div>
        <ActionForm action={companyAction} className="card p-4">
          <input type="hidden" name="reset" value="1" />
          <p className="mb-2 text-[12.5px] text-muted">Go back to the original name, colours and logo.</p>
          <Submit variant="secondary" size="sm">
            <RotateCcw className="size-3.5" /> Reset to default
          </Submit>
        </ActionForm>
      </div>
    </div>
  );
}
