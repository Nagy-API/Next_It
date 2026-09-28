import { getCurrentUser } from "@/server/auth";
import { getChatMessages, markChatRead } from "@/server/chat";

/** New chat messages since `after` (ISO time). Polled by the chat page every few seconds. */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response(null, { status: 401 });
  const after = new URL(req.url).searchParams.get("after");
  const d = after ? new Date(after) : undefined;
  const messages = await getChatMessages({ after: d && !Number.isNaN(d.getTime()) ? d : undefined, limit: 100 });
  await markChatRead(user.id);
  return Response.json({ messages }, { headers: { "Cache-Control": "no-store" } });
}
