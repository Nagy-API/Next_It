"use server";

/** Big updates, daily messages, reactions, kudos, moods, birthdays, and deleting / restoring a brand. */
import type { ActionResult } from "@/app/actions";
import { deleteBrand, restoreBrand } from "@/server/admin";
import { giveKudos, pinUpdate, postUpdate, removeKudos, removeUpdate, setBirthday, setMood, toggleReaction } from "@/server/fun";
import { setDailyMessages } from "@/server/settings";
import { resetOrder, saveOrder } from "@/server/order";
import { opt, run, str } from "./run";

export async function postUpdateAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async (actor) => {
    await postUpdate(actor, { title: opt(fd, "title"), text: str(fd, "text"), emoji: opt(fd, "emoji"), color: opt(fd, "color"), pinned: fd.get("pinned") === "on", days: Number(str(fd, "days") || 3) });
    return { message: "Posted for everyone. 📣", celebrate: "small" };
  });
}

export async function removeUpdateAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async (actor) => {
    await removeUpdate(actor, str(fd, "id"));
    return "Removed.";
  });
}

export async function pinUpdateAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async (actor) => {
    await pinUpdate(actor, str(fd, "id"), str(fd, "pinned") === "1");
  });
}

export async function reactAction(kind: "announcement" | "chat" | "kudos", id: string, emoji: string): Promise<ActionResult> {
  return run(async (actor) => {
    await toggleReaction(actor, kind, id, emoji);
  });
}

export async function kudosAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async (actor) => {
    await giveKudos(actor, { toId: str(fd, "toId"), emoji: str(fd, "emoji") || "🌟", text: str(fd, "text") });
    return { message: "Kudos sent! 🌟", celebrate: "small" };
  });
}

export async function removeKudosAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async (actor) => {
    await removeKudos(actor, str(fd, "id"));
    return "Removed.";
  });
}

export async function moodAction(emoji: string | null): Promise<ActionResult> {
  return run(async (actor) => {
    await setMood(actor, emoji);
  });
}

export async function birthdayAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async (actor) => {
    const m = str(fd, "month");
    const d = str(fd, "day");
    await setBirthday(actor, m && d ? `${m.padStart(2, "0")}-${d.padStart(2, "0")}` : null);
    return m && d ? "Birthday saved 🎂" : "Birthday removed.";
  });
}

export async function dailyMessagesAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async (actor) => {
    await setDailyMessages(actor, str(fd, "lines").split(/\r?\n/));
    return "Daily messages saved.";
  });
}

export async function deleteBrandAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async (actor) => {
    const n = await deleteBrand(actor, str(fd, "brandId"), str(fd, "confirm"));
    return `Brand deleted with ${n} item(s). You can restore it from Settings → Brands.`;
  });
}

export async function restoreBrandAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async (actor) => {
    await restoreBrand(actor, str(fd, "brandId"));
    return { message: "Brand restored with its items.", celebrate: "small" };
  });
}

export async function saveOrderAction(keys: string[]): Promise<ActionResult> {
  return run(async (actor) => {
    await saveOrder(actor, Array.isArray(keys) ? keys.map(String) : []);
  });
}

export async function resetOrderAction(keys: string[]): Promise<ActionResult> {
  return run(async (actor) => {
    await resetOrder(actor, Array.isArray(keys) ? keys.map(String) : []);
    return "Back to the automatic order.";
  });
}
