import { requireUser } from "@/server/auth";
import { getActivePeople } from "@/server/cached";
import { getChatMessages, markChatRead } from "@/server/chat";
import { isManager } from "@/domain/permissions";
import { ChatRoom } from "./room";
import { getBranding } from "@/server/branding";

export const metadata = { title: "Team chat" };

export default async function ChatPage() {
  const me = await requireUser();
  const [messages, people, brand] = await Promise.all([getChatMessages({ limit: 120 }), getActivePeople(), getBranding()]);
  await markChatRead(me.id);
  return (
    <ChatRoom
      me={{ id: me.id, name: me.name, manager: isManager(me) }}
      initial={messages.map((m) => ({ ...m, createdAt: m.createdAt.toISOString() }))}
      people={people.map((p) => ({ id: p.id, name: p.name, title: p.title }))}
      company={brand.name}
    />
  );
}
