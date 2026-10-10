/** Shared by the server-action files: sign-in, temporary-password guard, errors → messages, page refresh. */
import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/app/actions";
import type { Actor } from "@/server/activity";
import { requireActor } from "@/server/auth";
import { UserError } from "@/server/errors";

export type Done = { message: string; celebrate?: "small" | "big" };

export const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v : "";
};
export const opt = (fd: FormData, k: string) => (fd.has(k) ? str(fd, k).trim() || null : undefined);

export async function run(fn: (actor: Actor) => Promise<string | Done | void>): Promise<ActionResult> {
  const actor = await requireActor();
  if (actor.user.mustChangePassword) return { ok: false, error: "Choose your own password first (My account).", at: Date.now() };
  try {
    const out = await fn(actor);
    revalidatePath("/", "layout");
    if (out && typeof out === "object") return { ok: true, message: out.message, celebrate: out.celebrate, at: Date.now() };
    return { ok: true, message: out || undefined, at: Date.now() };
  } catch (e) {
    if (e instanceof UserError) return { ok: false, error: e.message, at: Date.now() };
    console.error(e);
    return { ok: false, error: "Something went wrong. Please try again.", at: Date.now() };
  }
}
