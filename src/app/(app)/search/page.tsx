import Link from "next/link";
import { SearchX } from "lucide-react";
import { ItemList } from "@/components/item-row";
import { Avatar, BrandDot, Empty, PageHeader, SectionTitle } from "@/components/ui";
import { requireUser } from "@/server/auth";
import { search } from "@/server/queries";

export const metadata = { title: "Search" };

export default async function SearchPage({ searchParams }: PageProps<"/search">) {
  await requireUser();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const r = await search(q);
  const total = r.items.length + r.brands.length + r.clients.length + r.projects.length + r.people.length;
  return (
    <div>
      <PageHeader title={q ? `“${q}”` : "Search"} subtitle={q.trim().length < 2 ? "Type at least 2 characters in the search box." : `${total} result${total === 1 ? "" : "s"}`} />
      {q.trim().length >= 2 && total === 0 && <Empty icon={SearchX} title="No matches">Try part of a title, a brand, a client or a person&rsquo;s name.</Empty>}
      <div className="space-y-7">
        {(r.brands.length > 0 || r.clients.length > 0 || r.projects.length > 0 || r.people.length > 0) && (
          <div className="flex flex-wrap gap-2">
            {r.brands.map((b) => (
              <Link key={b.id} href={`/brands/${b.slug}`} className="card flex items-center gap-2 px-3 py-2 text-[14px] font-medium hover:border-line-strong">
                <BrandDot color={b.color} /> {b.name} <span className="text-[12px] font-normal text-muted">brand</span>
              </Link>
            ))}
            {r.clients.map((c) => (
              <Link key={c.id} href={`/projects#${c.slug}`} className="card px-3 py-2 text-[14px] font-medium hover:border-line-strong">
                {c.name} <span className="text-[12px] font-normal text-muted">client</span>
              </Link>
            ))}
            {r.projects.map((p) => (
              <Link key={p.id} href={`/projects/${p.id}`} className="card px-3 py-2 text-[14px] font-medium hover:border-line-strong">
                {p.clientName} · {p.name} <span className="text-[12px] font-normal text-muted">project</span>
              </Link>
            ))}
            {r.people.map((p) => (
              <Link key={p.id} href={`/team/${p.username}`} className="card flex items-center gap-2 px-3 py-2 text-[14px] font-medium hover:border-line-strong">
                <Avatar name={p.name} size={20} /> {p.name} <span className="text-[12px] font-normal text-muted">{p.title ?? "person"}</span>
              </Link>
            ))}
          </div>
        )}
        {r.items.length > 0 && (
          <section>
            <SectionTitle>Content</SectionTitle>
            <ItemList items={r.items} showContext />
          </section>
        )}
      </div>
    </div>
  );
}
