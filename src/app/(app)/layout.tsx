import { Shell } from "@/components/shell";
import { ToastProvider } from "@/components/client";
import { requireUser } from "@/server/auth";
import { getAllBrands, getOpenItems } from "@/server/cached";
import { getMyMessages, tasksFor } from "@/server/queries";
import { can } from "@/domain/permissions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const [brands, open, messages] = await Promise.all([getAllBrands(), getOpenItems(), getMyMessages(user.id)]);
  const navBrands = brands
    .filter((b) => b.isActive)
    .map((b) => {
      const mine = open.filter((i) => i.brand?.id === b.id);
      return { id: b.id, name: b.name, slug: b.slug, color: b.color, open: mine.length, late: mine.filter((i) => i.attention === "overdue").length };
    });
  const myCount = tasksFor(open, user).length + messages.length;
  return (
    <ToastProvider>
      <Shell user={user} brands={navBrands} myCount={myCount} canAdd={can.editContent(user)}>
        {children}
      </Shell>
    </ToastProvider>
  );
}
