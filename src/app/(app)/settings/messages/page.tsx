import { redirect } from "next/navigation";
import { Megaphone, Sparkles } from "lucide-react";
import { requireUser } from "@/server/auth";
import { can } from "@/domain/permissions";
import { getWorkspace } from "@/server/settings";
import { dailyMessage, getUpdates } from "@/server/fun";
import { UpdatesBoard } from "@/components/people";
import { DailyMessagesForm } from "./form";

export const metadata = { title: "Messages" };

export default async function MessagesSettings() {
  const me = await requireUser();
  if (!can.announce(me) && !can.postUpdates(me)) redirect("/settings");
  const [ws, today, updates] = await Promise.all([getWorkspace(), dailyMessage(me.name), getUpdates(me.id)]);
  return (
    <div className="space-y-6">
      {can.announce(me) && (
        <section className="card p-5">
          <div className="flex items-center gap-2 font-display text-[16px] font-bold">
            <Sparkles className="size-4 text-electric" /> The daily message
          </div>
          <p className="mt-1 max-w-[720px] text-[13.5px] text-muted">
            One short line at the top of every page, under the greeting. Write one message per line: the system shows one per day, in turn, to everyone. It never shows who wrote it. Leave it empty
            for friendly built-in lines.
          </p>
          <div className="mt-3 rounded-xl border border-line bg-subtle px-4 py-3 text-[14px]">
            <span className="text-[12px] font-semibold uppercase tracking-[0.1em] text-muted">Today everyone sees</span>
            <div className="mt-0.5 font-medium">
              <Sparkles className="mr-1 inline size-3.5 -translate-y-px text-electric" />
              {today}
            </div>
          </div>
          <DailyMessagesForm lines={ws.dailyMessages} />
        </section>
      )}
      {can.postUpdates(me) && (
        <section>
          <p className="mb-3 flex items-center gap-2 text-[13.5px] text-muted">
            <Megaphone className="size-4 text-electric" /> Big updates show large at the top of the Overview, and everyone gets a notification.
          </p>
          <UpdatesBoard
            updates={updates.map((u) => ({ id: u.id, title: u.title, text: u.text, emoji: u.emoji, color: u.color, pinned: u.pinned, createdAt: u.createdAt.toISOString(), by: u.by, reactions: u.reactions }))}
            canPost
            me={me.name}
          />
        </section>
      )}
    </div>
  );
}
