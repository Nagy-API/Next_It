"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { checkAccountAction, connectSocialAction, disconnectAccountAction, discoverSocialAction, saveSocialConfigAction, setAccountBrandAction, testPublicAddressAction } from "@/app/social-actions";
import type { SocialPlatform } from "@/domain/social";
import { ActionForm, AutoSelect, Submit, useToast } from "../client";
import { PlatformIcon } from "../platform-icon";
import { btn } from "../ui";

type BrandLite = { id: string; name: string };
const Hint = ({ children }: { children: React.ReactNode }) => <p className="mt-1 text-[12px] leading-relaxed text-muted">{children}</p>;

/** The Meta app's ID and secret, and the address Meta downloads media from. */
export function AppForm({ appId, hasSecret, publicUrl, detected, privacyUrl }: { appId: string; hasSecret: boolean; publicUrl: string; detected: string; privacyUrl: string }) {
  const [, start] = useTransition();
  const [testing, setTesting] = useState(false);
  const push = useToast();
  return (
    <ActionForm action={saveSocialConfigAction} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="sc-app-id">
            App ID
          </label>
          <input id="sc-app-id" name="appId" className="field" defaultValue={appId} inputMode="numeric" autoComplete="off" placeholder="e.g. 1234567890123456" />
          <Hint>The number at the top of your app&rsquo;s page on developers.facebook.com (also in App settings → Basic).</Hint>
        </div>
        <div>
          <label className="label" htmlFor="sc-app-secret">
            App secret
          </label>
          <input id="sc-app-secret" name="appSecret" type="password" className="field" autoComplete="new-password" placeholder={hasSecret ? "Saved — leave empty to keep it" : "Paste it here"} />
          <Hint>App settings → Basic → App secret → Show. It is stored encrypted and never shown again. It lets the connection last without expiring.</Hint>
        </div>
      </div>
      <div>
        <label className="label" htmlFor="sc-public">
          This system&rsquo;s public address
        </label>
        <input id="sc-public" name="publicUrl" className="field" defaultValue={publicUrl || detected} placeholder="https://ops.yourcompany.com" autoComplete="off" />
        <Hint>
          The address you open this system with, starting with https://. Facebook and Instagram download each photo and video from it when a post goes out, so it must work from the internet — an office-only address (localhost, 192.168…) can post text but not media. In your Meta app, set the Privacy Policy URL to <b className="font-medium text-ink-2">{privacyUrl}</b>.
        </Hint>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Submit>Save</Submit>
        <button
          type="button"
          className={btn("secondary", "md")}
          disabled={testing}
          onClick={() => {
            setTesting(true);
            start(async () => {
              const r = await testPublicAddressAction();
              setTesting(false);
              if (r) push(r.ok ? { kind: "ok", text: r.message ?? "It answers." } : { kind: "error", text: r.error });
            });
          }}
        >
          {testing && <Loader2 className="size-4 animate-spin" />} Test the saved address
        </button>
      </div>
    </ActionForm>
  );
}

type Found = { pageId: string; name: string; instagram: { id: string; username: string | null } | null; connected: { facebook: boolean; instagram: boolean } };
type Pick = { facebook: boolean; instagram: boolean; brandId: string };

/** Paste an access token → see the pages it gives → choose which to connect, and to which brand. */
export function ConnectPanel({ brands, ready, scopes }: { brands: BrandLite[]; ready: boolean; scopes: string[] }) {
  const [token, setToken] = useState("");
  const [found, setFound] = useState<Found[] | null>(null);
  const [picks, setPicks] = useState<Record<string, Pick>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const push = useToast();
  const guess = (name: string) => brands.find((b) => name.toLowerCase().includes(b.name.toLowerCase()) || b.name.toLowerCase().includes(name.toLowerCase()))?.id ?? "";
  const find = () => {
    setError(null);
    start(async () => {
      const r = await discoverSocialAction(token);
      if (!r.ok) return setError(r.error);
      setFound(r.pages);
      setPicks(Object.fromEntries(r.pages.map((p) => [p.pageId, { facebook: true, instagram: !!p.instagram, brandId: guess(p.name) }])));
      setToken("");
    });
  };
  const connect = () => {
    setError(null);
    start(async () => {
      const r = await connectSocialAction((found ?? []).map((p) => ({ pageId: p.pageId, brandId: picks[p.pageId]?.brandId || null, facebook: !!picks[p.pageId]?.facebook, instagram: !!picks[p.pageId]?.instagram })));
      if (r && !r.ok) return setError(r.error);
      if (r?.message) push({ kind: "ok", text: r.message });
      setFound(null);
      router.refresh();
    });
  };
  const set = (id: string, patch: Partial<Pick>) => setPicks((p) => ({ ...p, [id]: { ...p[id], ...patch } }));
  return (
    <div className="space-y-3">
      {!found ? (
        <>
          <div>
            <label className="label" htmlFor="sc-token">
              Access token
            </label>
            <textarea id="sc-token" className="field min-h-[84px] resize-y font-mono text-[12.5px]" value={token} onChange={(e) => setToken(e.target.value)} placeholder="EAA…" autoComplete="off" spellCheck={false} disabled={!ready} />
            <Hint>
              Get it from developers.facebook.com → Tools → Graph API Explorer: choose your app, choose &ldquo;User Token&rdquo;, add the permissions below, press Generate Access Token, and in the window that opens select <b className="font-medium text-ink-2">every Page and Instagram account</b> you want to post to. Copy the long code and paste it here. It is used once to read your pages; only each page&rsquo;s own token is kept (encrypted).
            </Hint>
            <div className="mt-2 flex flex-wrap gap-1">
              {scopes.map((s) => (
                <code key={s} className="rounded bg-sunken px-1.5 py-0.5 text-[11.5px] text-ink-2">
                  {s}
                </code>
              ))}
            </div>
          </div>
          <button type="button" className={btn("primary", "md")} onClick={find} disabled={pending || !ready || token.trim().length < 20}>
            {pending && <Loader2 className="size-4 animate-spin" />} Find my pages
          </button>
          {!ready && <Hint>Save the App ID and App secret above first.</Hint>}
        </>
      ) : (
        <>
          <p className="text-[13px] text-ink-2">Meta gave access to these pages. Tick what to connect and choose the brand each one belongs to.</p>
          <ul className="divide-y divide-line rounded-lg border border-line">
            {found.map((p) => (
              <li key={p.pageId} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2.5">
                <div className="min-w-[180px] flex-1">
                  <div className="text-[14px] font-medium">{p.name}</div>
                  {!p.instagram && <div className="text-[12px] text-muted">No Instagram professional account is linked to this Page.</div>}
                </div>
                <label className="inline-flex items-center gap-1.5 text-[13px]">
                  <input type="checkbox" checked={!!picks[p.pageId]?.facebook} onChange={(e) => set(p.pageId, { facebook: e.target.checked })} />
                  <PlatformIcon name="facebook" size={18} /> Page{p.connected.facebook ? " (reconnect)" : ""}
                </label>
                {p.instagram && (
                  <label className="inline-flex items-center gap-1.5 text-[13px]">
                    <input type="checkbox" checked={!!picks[p.pageId]?.instagram} onChange={(e) => set(p.pageId, { instagram: e.target.checked })} />
                    <PlatformIcon name="instagram" size={18} /> @{p.instagram.username ?? "instagram"}
                    {p.connected.instagram ? " (reconnect)" : ""}
                  </label>
                )}
                <select className="field field-sm w-auto" value={picks[p.pageId]?.brandId ?? ""} onChange={(e) => set(p.pageId, { brandId: e.target.value })} aria-label={`Brand for ${p.name}`}>
                  <option value="">No brand</option>
                  {brands.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <button type="button" className={btn("primary", "md")} onClick={connect} disabled={pending}>
              {pending && <Loader2 className="size-4 animate-spin" />} Connect selected
            </button>
            <button type="button" className={btn("ghost", "md")} onClick={() => setFound(null)} disabled={pending}>
              Cancel
            </button>
          </div>
        </>
      )}
      {error && (
        <p role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-[13px] font-medium text-bad">
          {error}
        </p>
      )}
    </div>
  );
}

export type ChannelRow = { id: string; platform: SocialPlatform; name: string; username: string | null; brandId: string | null; status: "ok" | "error"; lastError: string | null; checked: string | null };

export function ChannelList({ channels, brands }: { channels: ChannelRow[]; brands: BrandLite[] }) {
  const [sure, setSure] = useState<string | null>(null);
  if (!channels.length) return <p className="text-[13px] text-muted">No channel is connected yet.</p>;
  return (
    <ul className="divide-y divide-line rounded-lg border border-line">
      {channels.map((c) => (
        <li key={c.id} className="px-3 py-2.5">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <PlatformIcon name={c.platform} size={26} />
            <div className="min-w-[160px] flex-1">
              <div className="text-[14px] font-medium">{c.username ? `@${c.username}` : c.name}</div>
              <div className={clsx("flex items-center gap-1 text-[12px]", c.status === "error" ? "text-bad" : "text-muted")}>
                {c.status === "error" ? <AlertTriangle className="size-3.5" /> : <CheckCircle2 className="size-3.5 text-ok" />}
                {c.status === "error" ? "Not working — connect it again" : "Connected"}
                {c.checked && <span className="text-faint">· checked {c.checked}</span>}
              </div>
            </div>
            <ActionForm action={setAccountBrandAction} inlineError={false}>
              <input type="hidden" name="id" value={c.id} />
              <AutoSelect name="brandId" defaultValue={c.brandId ?? ""} aria-label={`Brand of ${c.name}`}>
                <option value="">No brand</option>
                {brands.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </AutoSelect>
            </ActionForm>
            <ActionForm action={checkAccountAction} inlineError={false}>
              <input type="hidden" name="id" value={c.id} />
              <Submit variant="secondary" size="sm">
                Check
              </Submit>
            </ActionForm>
            {sure === c.id ? (
              <ActionForm action={disconnectAccountAction} inlineError={false} onSuccess={() => setSure(null)}>
                <input type="hidden" name="id" value={c.id} />
                <Submit variant="danger" size="sm">
                  Yes, disconnect
                </Submit>
              </ActionForm>
            ) : (
              <button type="button" className={btn("ghost", "sm")} onClick={() => setSure(c.id)}>
                Disconnect
              </button>
            )}
          </div>
          {c.status === "error" && c.lastError && <p className="mt-1.5 rounded-md bg-bad-soft px-2 py-1 text-[12.5px] text-ink">Meta said: {c.lastError}</p>}
        </li>
      ))}
    </ul>
  );
}
