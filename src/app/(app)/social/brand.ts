import { cookies } from "next/headers";
import { SOCIAL_BRAND_COOKIE } from "@/domain/social";
import { getAllBrands } from "@/server/cached";
import { listAccounts } from "@/server/social";

/**
 * The brand whose schedule is on screen: chosen with the switcher at the top of the section and remembered in a
 * cookie, so Calendar, Media and Analytics all show the same brand. `current: null` = every brand together.
 * `connected` = the brands that have at least one Facebook Page or Instagram account connected (Configuration);
 * `channels` = how many channels are connected in total.
 */
export async function socialBrands() {
  const [all, accounts, jar] = await Promise.all([getAllBrands(), listAccounts(), cookies()]);
  const brands = all.filter((b) => b.isActive);
  const slug = jar.get(SOCIAL_BRAND_COOKIE)?.value ?? "";
  const connected = new Set(accounts.map((a) => a.brandId).filter((id): id is string => !!id));
  return { brands, current: brands.find((b) => b.slug === slug) ?? null, connected, channels: accounts.length };
}
