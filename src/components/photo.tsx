"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Camera, Loader2, Trash2 } from "lucide-react";
import { avatarAction } from "@/app/actions";
import { useToast } from "./client";
import { btn } from "./ui";

/** Resize a picked photo to a 256px square (center crop) JPEG in the browser, then save it. */
async function toSquareJpeg(file: File, size = 256): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("That file isn't a photo."));
      i.src = url;
    });
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, size, size);
    return canvas.toDataURL("image/jpeg", 0.86);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function PhotoPicker({ userId, name, hasPhoto, compact }: { userId: string; name: string; hasPhoto: boolean; compact?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const router = useRouter();
  const save = (data: string) =>
    start(async () => {
      const fd = new FormData();
      fd.set("userId", userId);
      fd.set("avatar", data);
      const r = await avatarAction(null, fd);
      if (r && !r.ok) toast({ kind: "error", text: r.error });
      else toast({ kind: "ok", text: data ? "Photo updated." : "Photo removed." });
      router.refresh();
    });
  const working = pending || busy;
  return (
    <div className="flex items-center gap-1.5">
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="sr-only"
        aria-label={`Photo for ${name}`}
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          setBusy(true);
          try {
            save(await toSquareJpeg(f));
          } catch (err) {
            toast({ kind: "error", text: (err as Error).message });
          } finally {
            setBusy(false);
          }
        }}
      />
      <button type="button" disabled={working} onClick={() => input.current?.click()} className={btn(compact ? "ghost" : "secondary", "sm")}>
        {working ? <Loader2 className="size-3.5 animate-spin" /> : <Camera className="size-3.5" />}
        {compact ? "Photo" : hasPhoto ? "Change photo" : "Upload a photo"}
      </button>
      {hasPhoto && !compact && (
        <button type="button" disabled={working} onClick={() => save("")} className={btn("ghost", "sm")}>
          <Trash2 className="size-3.5" /> Remove
        </button>
      )}
    </div>
  );
}
