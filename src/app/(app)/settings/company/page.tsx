import { redirect } from "next/navigation";
import { requireUser } from "@/server/auth";
import { getBranding } from "@/server/branding";
import { CompanyForm } from "./company-form";

export const metadata = { title: "Company & branding · Settings" };

export default async function CompanySettings() {
  const me = await requireUser();
  if (!me.isAdmin) redirect("/settings/account");
  const b = await getBranding();
  return <CompanyForm brand={b} />;
}
