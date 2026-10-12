"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { AlertTriangle, ChevronLeft, ChevronRight, Loader2, Trash2, X } from "lucide-react";
import { deleteSocialPostAction, saveSocialPostAction } from "@/app/social-actions";
import { KIND_LABEL, LIMITS, POST_KINDS, checkPost, type PostKind, type SocialPlatform } from "@/domain/social";
import type { ActionResult } from "@/app/actions";
import { Modal, useToast } from "../client";
import { DateInput } from "../date-input";
import { PlatformIcon } from "../platform-icon";
import { btn } from "../ui";
import { BrandSelect } from "./brand-switcher";
import { MediaPicker, MediaThumb, type MediaItem } from "./media";

export type ChannelLite = { id: string; platform: SocialPlatform; name: string; username: string | null; brandId: string | null; status: "ok" | "error" };
export type BrandLite = { id: string; name: string; color: string; slug: string; logoUrl?: string | null; connected: boolean };
export type EditablePost = {
  id: string;
  brandId: string | null;
  kind: PostKind;
  caption: string;
  day: string | null;
  time: string | null;
  status: string;
  options: { shareToFeed?: boolean };
  media: MediaItem[];
  targets: { accountId: string; status: string; error: string | null; platform: SocialPlatform; accountName: string }[];
};

const KIND_HINT: Record<PostKind, string> = {
  post: "A normal post: text, one or more photos, or a video. Several photos become a carousel on Instagram.",
  reel: "One vertical video (9:16). On Facebook: 3 to 90 seconds.",
  story: "One photo or video that disappears after 24 hours. Instagram only for now.",
};

/**
 * Write a post, choose where and when it goes. Opens from an empty slot of the calendar (new) or from a post
 * that hasn't gone out yet (edit). Keyed by the caller, so each opening starts fresh.
 */
export function Composer({
  post,
  initial,
  channels,
  brands,
  media,
  onClose,
}: {
  post: EditablePost | null;
  initial: { day: string; time: string; brandId: string | null };
  channels: ChannelLite[];
  brands: BrandLite[];
  media: MediaItem[];
  onClose: () => void;
}) {
  const router = useRouter();
  const push = useToast();
  const [pending, start] = useTransition();
  // A new post starts on the brand chosen at the top — when that brand is connected. Otherwise the brand comes first.
  const usable = (b: string | null) => (b && brands.some((x) => x.id === b && x.connected) ? b : null);
  const [brandId, setBrandId] = useState<string | null>(post ? post.brandId : usable(initial.brandId));
  const [kind, setKind] = useState<PostKind>(post?.kind ?? "post");
  const [caption, setCaption] = useState(post?.caption ?? "");
  const [day, setDay] = useState(post ? (post.day ?? "") : initial.day);
  const [time, setTime] = useState(post ? (post.time ?? "") : initial.time);
  const [shareToFeed, setShareToFeed] = useState(post?.options.shareToFeed !== false);
  const [picked, setPicked] = useState<MediaItem[]>(post?.media.filter((m) => !m.gone) ?? []);
  // A post goes to its own brand's channels only.
  const forBrand = (b: string | null) => (b ? channels.filter((c) => c.brandId === b) : []);
  const [accountIds, setAccountIds] = useState<string[]>(post ? post.targets.map((t) => t.accountId) : forBrand(usable(initial.brandId)).filter((c) => c.status === "ok").map((c) => c.id));
  const [sure, setSure] = useState<"now" | "delete" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState(0);

  const shownChannels = forBrand(brandId);
  const chosen = channels.filter((c) => accountIds.includes(c.id));
  const platforms = [...new Set(chosen.map((c) => c.platform))];
  const problems = checkPost({ kind, caption, media: picked, platforms });
  const toInstagram = platforms.includes("instagram");
  const published = post?.targets.filter((t) => t.status === "published") ?? [];

  const toggleMedia = (m: MediaItem) => setPicked((list) => (list.some((x) => x.id === m.id) ? list.filter((x) => x.id !== m.id) : kind === "post" ? [...list, m] : [m]));
  const moveMedia = (i: number, dir: -1 | 1) =>
    setPicked((list) => {
      const j = i + dir;
      if (j < 0 || j >= list.length) return list;
      const next = [...list];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  const changeBrand = (b: string) => {
    setBrandId(b);
    // Another brand = its own channels (all ticked), and its own files.
    setAccountIds(forBrand(b).filter((c) => c.status === "ok").map((c) => c.id));
    if (b !== brandId) setPicked((list) => list.filter((m) => !m.brandId || m.brandId === b));
  };
  const noBrand = !brandId;
  const finish = (r: ActionResult) => {
    if (r && !r.ok) return setError(r.error);
    if (r?.message) push({ kind: "ok", text: r.message });
    router.refresh();
    onClose();
  };
  const save = (mode: "draft" | "schedule" | "now") => {
    setError(null);
    setSure(null);
    start(async () => {
      finish(await saveSocialPostAction({ id: post?.id ?? null, brandId, kind, caption, mediaIds: picked.map((m) => m.id), accountIds, day: day || null, time: time || null, options: { shareToFeed }, mode }));
    });
  };
  const current = picked[Math.min(preview, picked.length - 1)];

  return (
    <Modal open onClose={onClose} title={post ? "Edit post" : "New post"} width={980}>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-4">
          {post?.status === "failed" && (
            <div className="rounded-lg border border-bad/30 bg-bad-soft px-3 py-2 text-[13px] text-ink">
              <div className="flex items-center gap-1.5 font-semibold text-bad">
                <AlertTriangle className="size-4" /> It didn&rsquo;t go out
              </div>
              <ul className="mt-1 space-y-0.5">
                {post.targets
                  .filter((t) => t.error)
                  .map((t) => (
                    <li key={t.accountId}>
                      <b>{t.accountName}:</b> {t.error}
                    </li>
                  ))}
              </ul>
              <p className="mt-1 text-[12.5px] text-muted">Fix it below, then schedule it again.</p>
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <span className="label">Brand</span>
              <BrandSelect id="sp-brand" brands={brands} value={brandId} onChange={changeBrand} />
            </div>
            <div>
              <span className="label">Type</span>
              <div className="inline-flex w-full rounded-lg border border-line bg-surface p-0.5 text-[13.5px] font-medium">
                {POST_KINDS.map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => {
                      setKind(k);
                      if (k !== "post") setPicked((l) => l.slice(0, 1));
                    }}
                    className={clsx("flex-1 rounded-md px-2.5 py-1.5", kind === k ? "bg-strong text-white" : "text-ink-2 hover:bg-hover")}
                  >
                    {KIND_LABEL[k]}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <p className="-mt-2 text-[12px] text-muted">{KIND_HINT[kind]}</p>
          {noBrand && <p className="rounded-lg border border-electric/30 bg-electric-soft px-3 py-2 text-[13px] font-medium text-ink">Choose the brand first. Its channels and its photos and videos open after that.</p>}

          <fieldset disabled={noBrand} className={clsx("min-w-0 space-y-4", noBrand && "pointer-events-none select-none opacity-45")}>
          <div>
            <span className="label">Channels</span>
            {shownChannels.length ? (
              <div className="flex flex-wrap gap-1.5">
                {shownChannels.map((c) => {
                  const on = accountIds.includes(c.id);
                  const done = published.some((t) => t.accountId === c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      disabled={done}
                      aria-pressed={on}
                      title={done ? "Already published here" : c.status === "error" ? "This channel needs reconnecting (Configuration)" : undefined}
                      onClick={() => setAccountIds((ids) => (on ? ids.filter((i) => i !== c.id) : [...ids, c.id]))}
                      className={clsx("inline-flex items-center gap-1.5 rounded-full border py-1 pl-1 pr-2.5 text-[13px] font-medium transition-colors", on ? "border-electric bg-electric-soft text-ink" : "border-line bg-surface text-muted hover:border-line-strong")}
                    >
                      <PlatformIcon name={c.platform} size={20} muted={!on} />
                      {c.username ? `@${c.username}` : c.name}
                      {c.status === "error" && <AlertTriangle className="size-3.5 text-bad" />}
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="text-[13px] text-muted">{noBrand ? "The brand's Facebook Page and Instagram account show here." : "No channel is connected for this brand. Connect its Facebook Page in the Configuration tab."}</p>
            )}
          </div>

          <div>
            <div className="flex items-end justify-between">
              <label className="label" htmlFor="sp-caption">
                Caption
              </label>
              <span className={clsx("mb-1.5 text-[11.5px] tabular-nums", toInstagram && caption.length > LIMITS.instagram.caption ? "font-semibold text-bad" : "text-faint")}>
                {caption.length}
                {toInstagram ? ` / ${LIMITS.instagram.caption}` : ""}
              </span>
            </div>
            <textarea id="sp-caption" className="field min-h-[130px] resize-y [unicode-bidi:plaintext]" value={caption} onChange={(e) => setCaption(e.target.value)} placeholder={kind === "story" ? "Stories go out without a caption." : "Write the caption, with the hashtags at the end…"} disabled={kind === "story"} />
          </div>

          <div>
            <span className="label">
              {kind === "post" ? "Photos / video" : kind === "reel" ? "Video" : "Photo or video"}
              {picked.length > 1 && <span className="ml-1 font-normal text-muted">· in this order</span>}
            </span>
            {!!picked.length && (
              <ul className="mb-2 flex flex-wrap gap-2">
                {picked.map((m, i) => (
                  <li key={m.id} className="relative">
                    <button type="button" onClick={() => setPreview(i)} title={m.name}>
                      <MediaThumb m={m} className="size-[76px] rounded-lg" />
                    </button>
                    <button type="button" onClick={() => toggleMedia(m)} className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full bg-strong text-white shadow" aria-label={`Remove ${m.name}`}>
                      <X className="size-3" strokeWidth={3} />
                    </button>
                    {picked.length > 1 && (
                      <span className="absolute inset-x-0 bottom-0 flex justify-between px-0.5 pb-0.5">
                        <button type="button" disabled={i === 0} onClick={() => moveMedia(i, -1)} className="rounded bg-black/60 p-0.5 text-white disabled:opacity-30" aria-label="Move earlier">
                          <ChevronLeft className="size-3" />
                        </button>
                        <button type="button" disabled={i === picked.length - 1} onClick={() => moveMedia(i, 1)} className="rounded bg-black/60 p-0.5 text-white disabled:opacity-30" aria-label="Move later">
                          <ChevronRight className="size-3" />
                        </button>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <MediaPicker media={media} selected={picked.map((m) => m.id)} onToggle={toggleMedia} brandId={brandId} />
            <p className="mt-1 text-[12px] text-muted">Files go out exactly as uploaded, at their original quality.</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <span className="label">Day</span>
              <DateInput name="day" value={day} onChange={setDay} aria-label="Day" />
            </div>
            <div>
              <label className="label" htmlFor="sp-time">
                Time (Cairo)
              </label>
              <input id="sp-time" type="time" className="field" value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
          </div>

          {toInstagram && (kind === "reel" || (picked.length === 1 && picked[0].kind === "video" && kind === "post")) && (
            <label className="flex items-start gap-2 text-[13px]">
              <input type="checkbox" className="mt-0.5" checked={shareToFeed} onChange={(e) => setShareToFeed(e.target.checked)} />
              <span>
                Also show it in the Instagram profile grid
                <span className="block text-[12px] text-muted">Off = it appears in the Reels tab only.</span>
              </span>
            </label>
          )}
          </fieldset>
        </div>

        <aside className="min-w-0">
          <span className="label">Preview</span>
          <div className="overflow-hidden rounded-xl border border-line bg-surface">
            <div className="flex items-center gap-2 px-3 py-2">
              {chosen[0] ? <PlatformIcon name={chosen[0].platform} size={22} /> : <span className="size-[22px] rounded-md bg-sunken" />}
              <span className="truncate text-[13px] font-semibold">{chosen[0] ? chosen[0].username || chosen[0].name : "Choose a channel"}</span>
              {chosen.length > 1 && <span className="text-[12px] text-muted">+{chosen.length - 1}</span>}
            </div>
            {current ? (
              <div className="relative">
                <MediaThumb key={current.id} m={current} controls className={clsx("w-full", kind === "post" ? "aspect-square" : "aspect-[9/16]")} />
                {picked.length > 1 && <span className="absolute right-2 top-2 rounded-full bg-black/60 px-1.5 text-[11px] font-semibold text-white">{Math.min(preview, picked.length - 1) + 1}/{picked.length}</span>}
              </div>
            ) : (
              <div className="flex aspect-[4/3] items-center justify-center bg-sunken text-[12.5px] text-muted">No photo or video yet</div>
            )}
            {kind !== "story" && (
              <p className="max-h-[180px] overflow-y-auto whitespace-pre-wrap break-words px-3 py-2.5 text-[13px] leading-relaxed text-ink [unicode-bidi:plaintext]">
                {caption || <span className="text-faint">The caption shows here.</span>}
              </p>
            )}
          </div>
          {!!problems.length && (
            <div className="mt-3 rounded-lg border border-warn/30 bg-warn-soft px-3 py-2 text-[12.5px] text-ink">
              <div className="mb-1 font-semibold text-warn">Before it can go out</div>
              <ul className="list-disc space-y-0.5 pl-4">
                {problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>

      {error && (
        <p role="alert" className="mt-4 rounded-lg bg-bad-soft px-3 py-2 text-[13px] font-medium text-bad">
          {error}
        </p>
      )}
      <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-line pt-4">
        {post &&
          (sure === "delete" ? (
            <button
              type="button"
              className={btn("danger", "md")}
              disabled={pending}
              onClick={() =>
                start(async () => {
                  finish(await deleteSocialPostAction(post.id));
                })
              }
            >
              Yes, delete it
            </button>
          ) : (
            <button type="button" className={btn("ghost", "md")} onClick={() => setSure("delete")} disabled={pending}>
              <Trash2 className="size-4" /> Delete
            </button>
          ))}
        <span className="ml-auto" />
        {pending && <Loader2 className="size-4 animate-spin text-muted" />}
        <button type="button" className={btn("ghost", "md")} onClick={onClose} disabled={pending}>
          Cancel
        </button>
        <button type="button" className={btn("secondary", "md")} onClick={() => save("draft")} disabled={pending || noBrand} title={noBrand ? "Choose the brand first" : undefined}>
          Save draft
        </button>
        {sure === "now" ? (
          <button type="button" className={btn("dark", "md")} onClick={() => save("now")} disabled={pending}>
            Yes, post it now
          </button>
        ) : (
          <button type="button" className={btn("secondary", "md")} onClick={() => setSure("now")} disabled={pending || !!problems.length} title="Publish right away">
            Post now
          </button>
        )}
        <button type="button" className={btn("primary", "md")} onClick={() => save("schedule")} disabled={pending || !!problems.length || !day || !time}>
          Schedule
        </button>
      </div>
    </Modal>
  );
}
