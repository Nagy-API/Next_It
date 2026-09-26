import { PageHeader } from "@/components/ui";
import { requireUser } from "@/server/auth";
import { SettingsTabs } from "./tabs";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const me = await requireUser();
  return (
    <div className="mx-auto max-w-[1080px]">
      <PageHeader title="Settings" subtitle={me.isAdmin ? "Brands, people and platforms. Everything here is logged in the history." : "Your account."} />
      <SettingsTabs isAdmin={me.isAdmin} />
      <div className="mt-6">{children}</div>
    </div>
  );
}
