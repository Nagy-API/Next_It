import { getCurrentUser } from "@/server/auth";
import { getChatMessages, markChatRead, onlineIds, typingNow } from "@/server/chat";
import { reactionsFor } from "@/server/fun";

/** New chat messages since `after` (ISO time), who's online and who's typing. Polled by the chat page every few seconds. */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response(null, { status: 401 });
  const after = new URL(req.url).searchParams.get("after");
  const d = after ? new Date(after) : undefined;
  const [messages, recent, online] = await Promise.all([
    getChatMessages({ after: d && !Number.isNaN(d.getTime()) ? d : undefined, limit: 100 }),
    getChatMessages({ limit: 120 }),
    onlineIds(),
  ]);
  const reactions = await reactionsFor("chat", recent.map((m) => m.id), user.id);
  await markChatRead(user.id);
  // The ids still there, so a message deleted by someone else disappears for everyone.
  return Response.json({ messages, online, typing: typingNow(user.id), reactions: Object.fromEntries(reactions), recent: { since: recent[0]?.createdAt ?? null, ids: recent.map((m) => m.id) } }, { headers: { "Cache-Control": "no-store" } });
}
