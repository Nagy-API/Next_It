import { requireUser } from "@/server/auth";
import { getActivePeople } from "@/server/cached";
import { getChatMessages, markChatRead } from "@/server/chat";
import { isManager } from "@/domain/permissions";
import { ChatRoom } from "./room";
import { BRAND } from "@/config/brand";

export const metadata = { title: "Team chat" };

export default async function ChatPage() {
  const me = await requireUser();
  const [messages, people] = await Promise.all([getChatMessages({ limit: 120 }), getActivePeople()]);
  await markChatRead(me.id);
  return (
    <ChatRoom
      me={{ id: me.id, name: me.name, manager: isManager(me) }}
      initial={messages.map((m) => ({ ...m, createdAt: m.createdAt.toISOString() }))}
      people={people.map((p) => ({ id: p.id, name: p.name, title: p.title }))}
      company={BRAND.name}
    />
  );
}
