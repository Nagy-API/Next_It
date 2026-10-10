import { Shell } from "@/components/shell";
import { ToastProvider } from "@/components/client";
import { AvatarProvider } from "@/components/avatar";
import { requireUser } from "@/server/auth";
import { getActivePeople, getAllBrands, getOpenItems } from "@/server/cached";
import { getMyMessages, getPeople, tasksFor } from "@/server/queries";
import { getTasksFor } from "@/server/tasks";
import { unreadChatCount } from "@/server/chat";
import { can, isManager } from "@/domain/permissions";
import { getWorkspace } from "@/server/settings";
import { mySpaceTasks, visibleSpaces } from "@/server/spaces";
import { currentAnnouncement } from "@/server/announcements";
import { FirstPassword } from "./first-password";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  // Temporary password (new account / admin reset): nothing else until they choose their own.
  if (user.mustChangePassword) return <FirstPassword name={user.name} />;
  const [ws, brands, open, messages, everyone, active, myTasks, chatUnread, spaces, mySpace, motd] = await Promise.all([
    getWorkspace(),
    getAllBrands(),
    getOpenItems(),
    getMyMessages(user.id),
    getPeople({ includeInactive: true }),
    getActivePeople(),
    getTasksFor(user.id),
    unreadChatCount(user.id),
    visibleSpaces(user).catch(() => []),
    mySpaceTasks(user).catch(() => []),
    currentAnnouncement().catch(() => null),
  ]);
  const navBrands = brands
    .filter((b) => b.isActive)
    .map((b) => {
      const mine = open.filter((i) => i.brand?.id === b.id);
      return { id: b.id, name: b.name, slug: b.slug, color: b.color, logoUrl: b.logoUrl, open: mine.length, late: mine.filter((i) => i.attention === "overdue").length };
    });
  // Work sent for approval is with the reviewer, not on the person.
  const onMe = tasksFor(open, user).filter((i) => !(i.current?.progress === "waiting_approval" && i.current.assignee?.id === user.id));
  const myCount = (ws.modules.content ? onMe.length : 0) + messages.length + myTasks.filter((t) => !t.doneAt).length + (ws.modules.spaces ? mySpace.length : 0);
  return (
    <ToastProvider>
      <AvatarProvider people={everyone.map((p) => ({ id: p.id, name: p.name, v: p.avatarUpdatedAt?.getTime() ?? null, manager: p.isManager || p.isAdmin, role: p.roleLabel }))}>
        <Shell
          user={{ ...user, manager: isManager(user) }}
          brands={navBrands}
          spaces={spaces.map((s) => ({ id: s.id, name: s.name, color: s.color, icon: s.icon, isPrivate: s.isPrivate, open: s.open, late: s.late }))}
          nav={{
            giveTasks: can.giveTasks(user),
            dashboard: can.seeDashboard(user),
            reports: can.seeReports(user),
            activity: can.seeActivity(user),
            settings: can.seeSettings(user),
            createSpaces: can.createSpaces(user),
            announce: can.announce(user),
            modules: ws.modules,
          }}
          motd={motd ? { id: motd.id, text: motd.text, emoji: motd.emoji, color: motd.color, by: motd.by } : null}
          look={{ name: ws.name, logos: ws.logos, watermark: ws.watermark, watermarkOpacity: ws.watermarkOpacity, customWordmark: ws.custom.wordmark }}
          myCount={myCount}
          chatUnread={chatUnread}
          canAdd={ws.modules.content && can.editContent(user)}
          taskPeople={active.map((p) => ({ id: p.id, name: p.name, teams: p.teams as string[] }))}
          taskBrands={brands.filter((b) => b.isActive).map((b) => ({ id: b.id, name: b.name }))}
        >
          {children}
        </Shell>
      </AvatarProvider>
    </ToastProvider>
  );
}
