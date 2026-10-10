import { can, type Who } from "@/domain/permissions";
import type { SettingsTab } from "@/app/(app)/settings/tabs";
import { getWorkspace } from "./settings";

/** The Settings tabs this person may open (Settings → Access decides). */
export async function settingsTabsFor(me: Who): Promise<SettingsTab[]> {
  const ws = await getWorkspace();
  const tabs: SettingsTab[] = [];
  if (can.customizeWorkspace(me)) tabs.push("workspace");
  if (can.manageAccess(me)) tabs.push("access");
  if (ws.modules.content && can.manageBrands(me)) tabs.push("brands");
  if (can.managePeople(me)) tabs.push("people");
  if (ws.modules.content && can.managePlatforms(me)) tabs.push("platforms");
  tabs.push("account");
  return tabs;
}
