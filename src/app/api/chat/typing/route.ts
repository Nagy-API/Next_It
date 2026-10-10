import { getCurrentUser } from "@/server/auth";
import { setTyping } from "@/server/chat";

/** "I'm typing" (called while someone types in Team chat; forgotten after a few seconds). */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response(null, { status: 401 });
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!origin || !host || new URL(origin).host !== host) return new Response(null, { status: 403 });
  setTyping(user.id, user.name);
  return new Response(null, { status: 204 });
}
