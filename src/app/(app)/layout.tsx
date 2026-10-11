import { cookies } from "next/headers";
import { Shell, type NavPage } from "@/components/shell";
import { parseSidebar } from "@/lib/sidebar";
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
import { pagesForSpaces } from "@/server/pages";
import { dailyMessage } from "@/server/fun";
import { getShootSchedule } from "@/server/shoots";
import { formatTime, todayISO } from "@/lib/dates";
import { FirstPassword } from "./first-password";

/** Good morning / afternoon / evening, by the time in Cairo. */
function greetingNow(now = new Date()) {
  const h = Number(formatTime(now).slice(0, 2));
  if (h < 5) return "Working late";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  // Temporary password (new account / admin reset): nothing else until they choose their own.
  if (user.mustChangePassword) return <FirstPassword name={user.name} />;
  const today = todayISO();
  const [ws, brands, open, messages, everyone, active, myTasks, chatUnread, spaces, mySpace, line, shootsToday, jar] = await Promise.all([
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
    dailyMessage(user.name, today).catch(() => ""),
    getShootSchedule(today, today).catch(() => []),
    cookies(),
  ]);
  const pages = await pagesForSpaces(spaces.map((s) => s.id)).catch(() => []);
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
      <AvatarProvider people={everyone.map((p) => ({ id: p.id, name: p.name, v: p.avatarUpdatedAt?.getTime() ?? null, manager: p.isManager || p.isAdmin, role: p.roleLabel, birthday: p.birthday === today.slice(5) }))}>
        <Shell
          user={{ ...user, manager: isManager(user) }}
          brands={navBrands}
          spaces={spaces.map((s) => ({
            id: s.id,
            name: s.name,
            color: s.color,
            icon: s.icon,
            isPrivate: s.isPrivate,
            open: s.open,
            late: s.late,
            manage: s.access.manage,
            pages: pages.filter((p) => p.spaceId === s.id).map((p) => ({ id: p.id, title: p.title, kind: p.kind as NavPage["kind"], icon: p.icon })),
          }))}
          nav={{
            giveTasks: can.giveTasks(user),
            dashboard: can.seeDashboard(user),
            reports: can.seeReports(user),
            activity: can.seeActivity(user),
            settings: can.seeSettings(user),
            createSpaces: can.createSpaces(user),
            manageBrands: can.manageBrands(user),
            exportPlans: can.exportPlan(user),
            modules: ws.modules,
          }}
          greeting={greetingNow()}
          dailyLine={line}
          look={{
            name: ws.name,
            logos: ws.logos,
            customWordmark: ws.custom.wordmark,
            // Each theme has its own watermark (a navy mark disappears on dark, a white one on light).
            light: ws.watermark === "none" || !ws.watermarkOpacity ? null : { src: ws.watermark === "image" ? ws.logos.watermark : ws.logos.markLight, opacity: ws.watermarkOpacity },
            dark: ws.watermarkDark === "none" || !ws.watermarkDarkOpacity ? null : { src: ws.watermarkDark === "image" ? ws.logos.watermarkDark : ws.logos.mark, opacity: ws.watermarkDarkOpacity },
          }}
          myCount={myCount}
          chatUnread={chatUnread}
          shootsToday={shootsToday.filter((s) => s.status !== "cancelled").length}
          canAdd={ws.modules.content && can.editContent(user)}
          taskPeople={active.map((p) => ({ id: p.id, name: p.name, teams: p.teams as string[], manager: p.isManager || p.isAdmin }))}
          meId={user.id}
          taskBrands={brands.filter((b) => b.isActive).map((b) => ({ id: b.id, name: b.name }))}
          sidebar={parseSidebar(jar.get("sb")?.value)}
        >
          {children}
        </Shell>
      </AvatarProvider>
    </ToastProvider>
  );
}
