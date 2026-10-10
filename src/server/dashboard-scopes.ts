import { and, asc, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import { folders, lists } from "@/db/schema";
import type { Actor } from "./activity";
import type { Scope } from "./dashboards";
import { visibleSpaces } from "./spaces";

/** "spaceId:fFolderId" / "spaceId:lListId" / "spaceId" / "" (everything). */
export function scopeValue(s: Scope) {
  if (!s.spaceId) return "";
  return s.listId ? `${s.spaceId}:l${s.listId}` : s.folderId ? `${s.spaceId}:f${s.folderId}` : s.spaceId;
}

/** Every scope this person can pick for a dashboard. */
export async function scopeOptions(actor: Actor) {
  const spaces = await visibleSpaces(actor);
  const ids = spaces.map((s) => s.id);
  const [fs, ls] = ids.length
    ? await Promise.all([
        db.select().from(folders).where(and(inArray(folders.spaceId, ids), isNull(folders.archivedAt))).orderBy(asc(folders.position)),
        db.select().from(lists).where(and(inArray(lists.spaceId, ids), isNull(lists.archivedAt))).orderBy(asc(lists.position)),
      ])
    : [[], []];
  const out = [{ value: "", label: "Everything you can see" }];
  for (const s of spaces) {
    out.push({ value: s.id, label: `${s.icon ?? ""} ${s.name}`.trim() });
    for (const f of fs.filter((x) => x.spaceId === s.id)) out.push({ value: `${s.id}:f${f.id}`, label: `${s.name} › ${f.name} (folder)` });
    for (const l of ls.filter((x) => x.spaceId === s.id)) out.push({ value: `${s.id}:l${l.id}`, label: `${s.name} › ${l.name}` });
  }
  return out;
}
