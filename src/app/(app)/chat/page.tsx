import { requireUser } from "@/server/auth";
import { getActivePeople } from "@/server/cached";
import { getChatMessages, lastSeen, markChatRead, onlineIds } from "@/server/chat";
import { reactionsFor } from "@/server/fun";
import { isManager } from "@/domain/permissions";
import { ChatRoom } from "./room";
import { getWorkspace } from "@/server/settings";

export const metadata = { title: "Team chat" };

export default async function ChatPage() {
  const me = await requireUser();
  const BRAND = await getWorkspace();
  const [messages, people, online, seen] = await Promise.all([getChatMessages({ limit: 120 }), getActivePeople(), onlineIds(), lastSeen()]);
  const reactions = await reactionsFor("chat", messages.map((m) => m.id), me.id);
  await markChatRead(me.id);
  return (
    <ChatRoom
      me={{ id: me.id, name: me.name, manager: isManager(me) }}
      initial={messages.map((m) => ({ ...m, createdAt: m.createdAt.toISOString() }))}
      initialReactions={Object.fromEntries(reactions)}
      initialOnline={online}
      people={people.map((p) => ({ id: p.id, name: p.name, title: p.title, seenAt: seen.find((s) => s.id === p.id)?.at?.toISOString() ?? null }))}
      company={BRAND.name}
    />
  );
}
