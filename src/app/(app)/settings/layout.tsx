import { PageHeader } from "@/components/ui";
import { SettingsTabs } from "./tabs";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-[1080px]">
      <PageHeader title="Settings" subtitle="Brands, people and platforms. Everything here is logged in the history." />
      <SettingsTabs />
      <div className="mt-6">{children}</div>
    </div>
  );
}
