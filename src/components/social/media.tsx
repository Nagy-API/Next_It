"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Check, Film, ImageIcon, Loader2, Trash2, UploadCloud } from "lucide-react";
import { deleteSocialMediaAction, mediaUploadedAction, setMediaBrandAction, setMediaThumbAction } from "@/app/social-actions";
import { MAX_MEDIA_BYTES, MEDIA_ACCEPT, MEDIA_TYPES, extOf, formatBytes, type MediaLite } from "@/domain/social";
import { useToast } from "../client";
import { btn } from "../ui";

export type MediaItem = MediaLite & { url: string; brandId?: string | null; createdBy?: string | null; uses?: number; gone?: boolean; hasThumb?: boolean };
type BrandLite = { id: string; name: string; color: string };

/** Draw a picture or a video frame small (longest side 360 px) → a JPEG data URL of a few kilobytes. */
function shrink(source: CanvasImageSource, w: number, h: number): string | null {
  if (!w || !h) return null;
  const scale = Math.min(1, 360 / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  for (const q of [0.72, 0.5, 0.3]) {
    const url = canvas.toDataURL("image/jpeg", q);
    if (url.length <= 110_000) return url;
  }
  return null;
}

/**
 * A small preview of an uploaded file, made here in the browser: the photo itself, or a frame from the start of
 * the video (read back from the server). It is only for the screens of this system — the file that goes to
 * Facebook / Instagram is always the untouched original.
 */
async function makeThumb(file: File, kind: "image" | "video", url: string): Promise<string | null> {
  try {
    if (kind === "image") {
      const bmp = await createImageBitmap(file);
      const out = shrink(bmp, bmp.width, bmp.height);
      bmp.close();
      return out;
    }
    return await new Promise<string | null>((resolve) => {
      const v = document.createElement("video");
      const done = (out: string | null) => {
        clearTimeout(timer);
        v.removeAttribute("src");
        v.load();
        resolve(out);
      };
      const timer = setTimeout(() => done(null), 20_000);
      v.muted = true;
      v.playsInline = true;
      v.preload = "auto";
      v.onloadeddata = () => {
        v.currentTime = Math.min(0.5, (v.duration || 1) / 2);
      };
      v.onseeked = () => {
        try {
          done(shrink(v, v.videoWidth, v.videoHeight));
        } catch {
          done(null);
        }
      };
      v.onerror = () => done(null);
      v.src = url;
    });
  } catch {
    return null;
  }
}

/**
 * Send one file to the library in pieces. The file is stored exactly as it is — no resizing, no compression —
 * so what goes to Facebook / Instagram is the original export.
 */
export async function uploadMedia(file: File, brandId: string | null, onProgress: (fraction: number) => void): Promise<MediaItem> {
  const type = MEDIA_TYPES[extOf(file.name)];
  if (!type) throw new Error(`“${file.name}”: the library takes JPG and PNG photos and MP4 or MOV videos.`);
  if (file.size > MAX_MEDIA_BYTES) throw new Error(`“${file.name}” is ${formatBytes(file.size)}. The biggest file the library takes is ${formatBytes(MAX_MEDIA_BYTES)}.`);
  let width: number | null = null;
  let height: number | null = null;
  if (type.kind === "image") {
    try {
      const bmp = await createImageBitmap(file);
      width = bmp.width;
      height = bmp.height;
      bmp.close();
    } catch {}
  }
  const start = await fetch("/api/social/upload", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: file.name, size: file.size, brandId, width, height }) });
  const started = (await start.json().catch(() => ({}))) as { id?: string; chunk?: number; error?: string };
  if (!start.ok || !started.id) throw new Error(started.error || "The upload didn't start. Please try again.");
  const chunk = started.chunk || 4 * 1024 * 1024;
  let offset = 0;
  let tries = 0;
  while (offset < file.size) {
    let res: Response | null = null;
    try {
      res = await fetch(`/api/social/upload?id=${started.id}&offset=${offset}`, { method: "PUT", body: file.slice(offset, offset + chunk) });
    } catch {}
    const out = (await res?.json().catch(() => null)) as { received?: number; done?: boolean; error?: string } | null;
    if (!res?.ok || typeof out?.received !== "number") {
      // A dropped connection: wait a little and send the same piece again (a few times).
      if (res && res.status >= 400 && res.status < 500) throw new Error(out?.error || "The upload was refused.");
      if (++tries > 5) throw new Error(out?.error || `The connection dropped while uploading “${file.name}”. Try again.`);
      await new Promise((r) => setTimeout(r, 1500 * tries));
      continue;
    }
    tries = 0;
    offset = out.received;
    onProgress(Math.min(1, offset / file.size));
  }
  const url = `/api/social/file/${started.id}`;
  const thumb = await makeThumb(file, type.kind, url);
  const saved = thumb ? await setMediaThumbAction(started.id, thumb).catch(() => null) : null;
  return { id: started.id, name: file.name, kind: type.kind, mime: type.mime, size: file.size, width, height, url, brandId, hasThumb: !!saved?.ok };
}

/**
 * A photo or a video, small. Lists show the saved preview (light, and it survives the file being removed from the
 * server once its post is out); `controls` = the real file, playable, while it is still there.
 */
export function MediaThumb({ m, className, controls }: { m: MediaItem; className?: string; controls?: boolean }) {
  const badge = m.kind === "video" && (
    <span className="absolute bottom-1 left-1 inline-flex items-center gap-1 rounded bg-black/60 px-1 py-px text-[10px] font-semibold text-white">
      <Film className="size-3" /> Video
    </span>
  );
  if (m.kind === "video" && !m.gone && (controls || !m.hasThumb))
    return (
      <span className={clsx("relative block overflow-hidden bg-navy-950", className)}>
        <video src={`${m.url}#t=0.1`} preload="metadata" muted playsInline controls={controls} className="size-full object-cover" />
        {!controls && badge}
      </span>
    );
  if (m.gone && !m.hasThumb)
    return (
      <span className={clsx("flex flex-col items-center justify-center gap-1 bg-sunken text-center text-[10.5px] leading-tight text-muted", className)} title="The file was removed from the server after the post went out">
        {m.kind === "video" ? <Film className="size-4" /> : <ImageIcon className="size-4" />}
      </span>
    );
  // The original photo when it is being looked at closely; the small preview everywhere else.
  const src = m.hasThumb && (m.gone || !controls || m.kind === "video") ? `${m.url}?thumb=1` : m.url;
  return (
    <span className={clsx("relative block overflow-hidden bg-sunken", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" loading="lazy" className="size-full object-cover" />
      {badge}
    </span>
  );
}

type Job = { key: string; name: string; fraction: number; error?: string };

/** Pick files (or drop them) and send them to the library, with a progress line per file. */
export function useUploader(brandId: string | null, onDone?: (m: MediaItem) => void) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const router = useRouter();
  const push = useToast();
  const send = async (files: File[]) => {
    for (const file of files) {
      const key = `${file.name}-${file.size}-${Date.now()}`;
      setJobs((j) => [...j, { key, name: file.name, fraction: 0 }]);
      try {
        const m = await uploadMedia(file, brandId, (fraction) => setJobs((j) => j.map((x) => (x.key === key ? { ...x, fraction } : x))));
        setJobs((j) => j.filter((x) => x.key !== key));
        onDone?.(m);
      } catch (e) {
        const error = e instanceof Error ? e.message : "The upload didn't work.";
        setJobs((j) => j.map((x) => (x.key === key ? { ...x, error } : x)));
        push({ kind: "error", text: error });
      }
    }
    await mediaUploadedAction();
    router.refresh();
  };
  const busy = jobs.some((j) => !j.error);
  const list = jobs.length ? (
    <ul className="space-y-1.5">
      {jobs.map((j) => (
        <li key={j.key} className="rounded-lg border border-line bg-surface px-3 py-2 text-[13px]">
          <div className="flex items-center gap-2">
            {!j.error && <Loader2 className="size-3.5 shrink-0 animate-spin text-electric" />}
            <span className="min-w-0 flex-1 truncate font-medium">{j.name}</span>
            {j.error ? (
              <button type="button" className="text-[12px] font-medium text-muted hover:text-ink" onClick={() => setJobs((x) => x.filter((y) => y.key !== j.key))}>
                Dismiss
              </button>
            ) : (
              <span className="tabular-nums text-muted">{Math.round(j.fraction * 100)}%</span>
            )}
          </div>
          {j.error ? (
            <p className="mt-1 text-[12.5px] text-bad">{j.error}</p>
          ) : (
            <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-track">
              <div className="h-full rounded-full bg-electric transition-[width]" style={{ width: `${j.fraction * 100}%` }} />
            </div>
          )}
        </li>
      ))}
    </ul>
  ) : null;
  return { send, busy, list };
}

export function UploadButton({ onFiles, label = "Upload", small, disabled }: { onFiles: (files: File[]) => void; label?: string; small?: boolean; disabled?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={ref}
        type="file"
        accept={MEDIA_ACCEPT}
        multiple
        hidden
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = "";
          if (files.length) onFiles(files);
        }}
      />
      <button type="button" disabled={disabled} onClick={() => ref.current?.click()} className={btn(small ? "secondary" : "primary", small ? "sm" : "md")}>
        <UploadCloud className="size-4" /> {label}
      </button>
    </>
  );
}

const dims = (m: MediaItem) => (m.width && m.height ? `${m.width}×${m.height}` : null);

/** The Media tab: what is on the server right now, newest first (for the brand chosen at the top). */
export function MediaLibrary({ media, brands, brandId, brandName, keepHours }: { media: MediaItem[]; brands: BrandLite[]; brandId: string | null; brandName: string | null; keepHours: number }) {
  const [kind, setKind] = useState<"all" | "image" | "video">("all");
  const [over, setOver] = useState(false);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [, start] = useTransition();
  const router = useRouter();
  const push = useToast();
  const up = useUploader(brandId);
  const shown = media.filter((m) => kind === "all" || m.kind === kind);
  const total = media.reduce((a, m) => a + m.size, 0);
  const act = (fn: () => ReturnType<typeof deleteSocialMediaAction>) =>
    start(async () => {
      const r = await fn();
      if (r && !r.ok) push({ kind: "error", text: r.error });
      else if (r?.message) push({ kind: "ok", text: r.message });
      router.refresh();
    });
  return (
    <div className="space-y-4">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          const files = [...e.dataTransfer.files];
          if (files.length) void up.send(files);
        }}
        className={clsx("rounded-xl border border-dashed px-5 py-6 text-center transition-colors", over ? "border-electric bg-electric-soft" : "border-line-strong bg-subtle")}
      >
        <div className="mx-auto mb-2 flex size-10 items-center justify-center rounded-full bg-electric-soft text-electric">
          <UploadCloud className="size-5" />
        </div>
        <div className="font-display text-[15px] font-bold">Drop photos and videos here</div>
        <p className="mx-auto mt-1 max-w-[560px] text-[12.5px] text-muted">
          JPG, PNG, MP4 or MOV, up to {formatBytes(MAX_MEDIA_BYTES)}. Files are kept exactly as you upload them — nothing is resized or compressed, so export at full quality (1080×1920 for Reels and Stories).
          {brandName ? ` New files go to ${brandName}.` : ""}
        </p>
        <p className="mx-auto mt-1 max-w-[560px] text-[12.5px] text-muted">
          To keep the server light, a file is removed by itself {keepHours} hours after its post is published everywhere. The post, its numbers and a small preview stay.
        </p>
        <div className="mt-3">
          <UploadButton onFiles={(f) => void up.send(f)} label="Choose files" />
        </div>
      </div>
      {up.list}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border border-line bg-surface p-0.5 text-[13px] font-medium">
          {(["all", "image", "video"] as const).map((k) => (
            <button key={k} type="button" onClick={() => setKind(k)} className={clsx("rounded-md px-2.5 py-1", kind === k ? "bg-strong text-white" : "text-ink-2 hover:bg-hover")}>
              {k === "all" ? "All" : k === "image" ? "Photos" : "Videos"}
            </button>
          ))}
        </div>
        <span className="ml-auto text-[12.5px] text-muted">
          {media.length} file{media.length === 1 ? "" : "s"} on the server{brandName ? ` for ${brandName}` : ""} · {formatBytes(total)}
        </span>
      </div>
      {shown.length ? (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {shown.map((m) => (
            <li key={m.id} className="card overflow-hidden">
              <a href={m.url} target="_blank" rel="noopener noreferrer" title="Open the original file">
                <MediaThumb m={m} className="aspect-square w-full" />
              </a>
              <div className="space-y-1.5 p-2.5">
                <div className="truncate text-[13px] font-medium" title={m.name}>
                  {m.name}
                </div>
                <div className="flex flex-wrap items-center gap-x-2 text-[11.5px] text-muted">
                  <span className="inline-flex items-center gap-1">
                    {m.kind === "video" ? <Film className="size-3" /> : <ImageIcon className="size-3" />}
                    {formatBytes(m.size)}
                  </span>
                  {dims(m) && <span>{dims(m)}</span>}
                  {!!m.uses && (
                    <span>
                      in {m.uses} post{m.uses === 1 ? "" : "s"}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  <select value={m.brandId ?? ""} onChange={(e) => act(() => setMediaBrandAction(m.id, e.target.value || null))} className="field field-sm min-w-0 flex-1" aria-label={`Brand of ${m.name}`}>
                    <option value="">No brand</option>
                    {brands.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                  {confirm === m.id ? (
                    <button type="button" className={btn("danger", "sm")} onClick={() => act(() => deleteSocialMediaAction(m.id))} onBlur={() => setConfirm(null)} autoFocus>
                      Delete?
                    </button>
                  ) : (
                    <button type="button" className="rounded-md p-1.5 text-muted hover:bg-bad-soft hover:text-bad" onClick={() => setConfirm(m.id)} aria-label={`Delete ${m.name}`}>
                      <Trash2 className="size-4" />
                    </button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="rounded-xl border border-dashed border-line-strong bg-subtle px-6 py-10 text-center text-[13px] text-muted">{media.length ? "Nothing matches these filters." : "No media yet. Upload the photos and videos you want to post."}</div>
      )}
    </div>
  );
}

/**
 * Inside the composer: tick files from the post's brand (or upload new ones, which get ticked by themselves and
 * belong to that brand). Nothing shows until the brand is chosen.
 */
export function MediaPicker({ media, selected, onToggle, brandId }: { media: MediaItem[]; selected: string[]; onToggle: (m: MediaItem) => void; brandId: string | null }) {
  const up = useUploader(brandId, (m) => onToggle(m));
  const shown = brandId ? media.filter((m) => !m.brandId || m.brandId === brandId) : [];
  return (
    <div className="rounded-lg border border-line bg-subtle p-2.5">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-[12px] font-medium text-ink-2">Media library</span>
        <span className="ml-auto" />
        <UploadButton onFiles={(f) => void up.send(f)} small disabled={up.busy || !brandId} />
      </div>
      {up.list && <div className="mb-2">{up.list}</div>}
      {shown.length ? (
        <ul className="grid max-h-[232px] grid-cols-4 gap-1.5 overflow-y-auto sm:grid-cols-6">
          {shown.map((m) => {
            const i = selected.indexOf(m.id);
            return (
              <li key={m.id}>
                <button type="button" onClick={() => onToggle(m)} title={m.name} className={clsx("relative block w-full overflow-hidden rounded-md ring-2", i >= 0 ? "ring-electric" : "ring-transparent hover:ring-line-strong")}>
                  <MediaThumb m={m} className="aspect-square w-full" />
                  {i >= 0 && (
                    <span className="absolute right-1 top-1 flex size-5 items-center justify-center rounded-full bg-electric text-[11px] font-bold text-white">{selected.length > 1 ? i + 1 : <Check className="size-3" strokeWidth={3} />}</span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="py-4 text-center text-[12.5px] text-muted">{brandId ? "Nothing here yet for this brand — upload a photo or a video." : "Choose the brand first."}</p>
      )}
    </div>
  );
}
