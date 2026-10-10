import { PageHeader } from "@/components/ui";
import { requireUser } from "@/server/auth";
import { settingsTabsFor } from "@/server/settings-tabs";
import { SettingsTabs } from "./tabs";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const me = await requireUser();
  const tabs = await settingsTabsFor(me);
  return (
    <div className="mx-auto max-w-[1080px]">
      <PageHeader title="Settings" subtitle={tabs.length > 1 ? "Everything here is logged in the history." : "Your account."} />
      <SettingsTabs tabs={tabs} />
      <div className="mt-6">{children}</div>
    </div>
  );
}
