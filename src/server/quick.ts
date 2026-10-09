/**
 * Quick update: one screen per step where a team updates many items at once (paste a list of links, one Save).
 * Every row goes through the normal workflow (same rules, same history), one by one; a row that can't be done is
 * skipped with the reason and never stops the others.
 */
import "server-only";
import type { StageKind } from "@/db/schema";
import type { Actor } from "./activity";
import { UserError } from "./errors";
import { handOff, setPlatformState, submitVersion } from "./workflow";

export type QuickRow = {
  stageId: string;
  itemId: string;
  title: string;
  kind: StageKind;
  /** Content link (content) or version link (editing / design). */
  link?: string;
  /** Content: send it on. Shooting: shot. */
  done?: boolean;
  /** Social: live links per platform. */
  live?: { platformId: string; url: string }[];
  /** Social: schedule the planned platforms for this day. */
  scheduleDate?: string;
};

export async function quickUpdate(actor: Actor, rows: QuickRow[]) {
  let done = 0;
  const skipped: { title: string; reason: string }[] = [];
  for (const r of rows.slice(0, 200)) {
    try {
      let acted = false;
      if (r.kind === "content" && r.done) {
        await handOff(actor, r.stageId, { canvaUrl: r.link?.trim() || undefined });
        acted = true;
      } else if (r.kind === "shooting" && r.done) {
        await handOff(actor, r.stageId);
        acted = true;
      } else if ((r.kind === "media" || r.kind === "design") && r.link?.trim()) {
        await submitVersion(actor, r.stageId, { url: r.link });
        acted = true;
      } else if (r.kind === "social") {
        for (const l of r.live ?? []) {
          if (!l.url.trim()) continue;
          await setPlatformState(actor, r.itemId, l.platformId, { liveUrl: l.url });
          acted = true;
        }
        if (r.scheduleDate) {
          for (const l of r.live ?? []) {
            if (l.url.trim()) continue;
            await setPlatformState(actor, r.itemId, l.platformId, { status: "scheduled", date: r.scheduleDate });
            acted = true;
          }
        }
      }
      if (acted) done++;
    } catch (e) {
      if (e instanceof UserError) skipped.push({ title: r.title, reason: e.message });
      else throw e;
    }
  }
  return { done, skipped };
}
