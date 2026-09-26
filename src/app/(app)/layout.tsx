import { Shell } from "@/components/shell";
import { ToastProvider } from "@/components/client";
import { requireUser } from "@/server/auth";
import { getAllBrands, getOpenItems } from "@/server/cached";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const [brands, open] = await Promise.all([getAllBrands(), getOpenItems()]);
  const navBrands = brands
    .filter((b) => b.isActive)
    .map((b) => {
      const mine = open.filter((i) => i.brand?.id === b.id);
      return { id: b.id, name: b.name, slug: b.slug, color: b.color, open: mine.length, late: mine.filter((i) => i.attention === "overdue").length };
    });
  const myCount = open.filter((i) => i.current?.assignee?.id === user.id).length;
  return (
    <ToastProvider>
      <Shell user={user} brands={navBrands} myCount={myCount}>
        {children}
      </Shell>
    </ToastProvider>
  );
}
