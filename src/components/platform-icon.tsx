import clsx from "clsx";

/**
 * Each app's own mark, drawn inline (no external images): Instagram, TikTok, Facebook, LinkedIn, YouTube, X,
 * Snapchat, Pinterest, Threads, WhatsApp, Behance. Anything else gets a globe. Matched by the platform's name.
 */
type Spec = { bg: string; fg?: string; path: React.ReactNode };

const ICONS: Record<string, Spec> = {
  instagram: {
    bg: "linear-gradient(45deg,#f9ce34 0%,#ee2a7b 50%,#6228d7 100%)",
    path: (
      <>
        <rect x="5" y="5" width="14" height="14" rx="4.2" fill="none" stroke="currentColor" strokeWidth="1.9" />
        <circle cx="12" cy="12" r="3.3" fill="none" stroke="currentColor" strokeWidth="1.9" />
        <circle cx="16.3" cy="7.8" r="1.05" fill="currentColor" />
      </>
    ),
  },
  tiktok: {
    bg: "#111111",
    path: <path fill="currentColor" d="M15.6 4.5c.4 1.7 1.6 3 3.4 3.2v2.6c-1.3 0-2.5-.4-3.5-1.1v5.3a4.6 4.6 0 1 1-4.6-4.6c.3 0 .5 0 .8.1v2.7a2 2 0 1 0 1.3 1.8V4.5h2.6z" />,
  },
  facebook: {
    bg: "#1877f2",
    path: <path fill="currentColor" d="M13.4 20v-6.3h2.1l.3-2.5h-2.4V9.6c0-.7.2-1.2 1.2-1.2h1.3V6.2c-.2 0-1-.1-1.9-.1-1.9 0-3.2 1.2-3.2 3.3v1.8H8.7v2.5h2.1V20h2.6z" />,
  },
  linkedin: {
    bg: "#0a66c2",
    path: <path fill="currentColor" d="M7.2 9.6h2.4V18H7.2V9.6zm1.2-3.8a1.4 1.4 0 1 1 0 2.8 1.4 1.4 0 0 1 0-2.8zM11.1 9.6h2.3v1.2c.3-.6 1.1-1.4 2.4-1.4 2.5 0 3 1.6 3 3.8V18h-2.4v-4.2c0-1 0-2.3-1.4-2.3s-1.6 1.1-1.6 2.2V18h-2.3V9.6z" />,
  },
  youtube: {
    bg: "#ff0000",
    path: <path fill="currentColor" d="M10 9v6l5.2-3L10 9z" />,
  },
  x: {
    bg: "#000000",
    path: <path fill="currentColor" d="M15.9 5.5h2.2l-4.8 5.5 5.6 7.5h-4.4l-3.5-4.5-4 4.5H4.8l5.1-5.9-5.4-7.1h4.5l3.1 4.1 3.8-4.1zm-.8 11.7h1.2L8.9 6.7H7.6l7.5 10.5z" />,
  },
  snapchat: {
    bg: "#fffc00",
    fg: "#111111",
    path: <path fill="currentColor" d="M12 5c2.2 0 3.7 1.6 3.7 3.8v1.9c.4.2.9 0 1.3-.1.4 0 .6.4.3.7-.4.3-1 .5-1.4.7.4 1.3 1.4 2.4 2.6 2.8.3.1.3.5 0 .6-.5.2-1.1.3-1.6.4-.1.3-.1.7-.4.8-.5.1-1-.1-1.6 0-.9.2-1.5 1.3-2.9 1.3s-2-1.1-2.9-1.3c-.6-.1-1.1.1-1.6 0-.3-.1-.3-.5-.4-.8-.5-.1-1.1-.2-1.6-.4-.3-.1-.3-.5 0-.6 1.2-.4 2.2-1.5 2.6-2.8-.4-.2-1-.4-1.4-.7-.3-.3-.1-.7.3-.7.4.1.9.3 1.3.1V8.8C8.3 6.6 9.8 5 12 5z" />,
  },
  pinterest: {
    bg: "#e60023",
    path: <path fill="currentColor" d="M12.3 5C8.4 5 6.5 7.7 6.5 10c0 1.4.5 2.6 1.6 3.1.2.1.4 0 .4-.2l.2-.6c0-.2 0-.3-.1-.5-.3-.4-.5-.9-.5-1.6 0-2.1 1.6-3.9 4-3.9 2.2 0 3.4 1.3 3.4 3.1 0 2.4-1 4.3-2.6 4.3-.9 0-1.5-.7-1.3-1.6.2-1.1.7-2.2.7-3 0-.7-.4-1.2-1.1-1.2-.9 0-1.6.9-1.6 2.2 0 .8.3 1.3.3 1.3l-1.1 4.6c-.3 1.4 0 3 0 3.2 0 .1.1.1.2 0 .1-.1 1.1-1.4 1.5-2.7l.6-2.3c.3.6 1.2 1.1 2.1 1.1 2.8 0 4.7-2.5 4.7-5.9C18 7.4 15.6 5 12.3 5z" />,
  },
  threads: {
    bg: "#000000",
    path: <path fill="currentColor" d="M15.5 11.4c-.1 0-.2-.1-.3-.1-.2-2.4-1.5-3.8-3.7-3.8-1.3 0-2.4.6-3.1 1.6l1.2.8c.5-.8 1.3-1 1.9-1 .8 0 1.4.2 1.7.7.3.3.4.8.5 1.3-.7-.1-1.5-.2-2.3-.1-2.2.1-3.7 1.4-3.6 3.2.1.9.5 1.7 1.3 2.2.6.4 1.5.6 2.3.6 1.1-.1 2-.5 2.6-1.2.4-.6.7-1.3.9-2.2.5.3.9.7 1.1 1.2.4.8.4 2.2-.7 3.3-1 1-2.2 1.4-4 1.4-2 0-3.6-.7-4.6-1.9C5.7 16.1 5.2 14.3 5.2 12s.5-4.1 1.5-5.3c1-1.2 2.6-1.9 4.6-1.9 2 0 3.6.7 4.7 1.9.5.6.9 1.4 1.2 2.3l1.4-.4c-.3-1.1-.8-2.1-1.5-2.9C15.7 4.1 13.8 3.3 11.3 3.3 8.9 3.3 7 4.1 5.7 5.7 4.5 7.1 3.8 9.3 3.8 12s.7 4.9 1.9 6.3c1.3 1.6 3.2 2.4 5.6 2.4 2.2 0 3.7-.6 5-1.9 1.7-1.7 1.6-3.8 1.1-5.1-.4-.9-1.1-1.7-1.9-2.3zm-3.8 3.6c-.9 0-1.8-.4-1.9-1.2 0-.6.4-1.3 2-1.4h.5c.6 0 1.1.1 1.6.2-.2 2-1.1 2.4-2.2 2.4z" />,
  },
  whatsapp: {
    bg: "#25d366",
    path: <path fill="currentColor" d="M12 4.5a7.4 7.4 0 0 0-6.4 11.2l-1 3.8 3.9-1A7.4 7.4 0 1 0 12 4.5zm4.3 10.5c-.2.5-1 1-1.5 1-.4.1-.9.1-1.4-.1-.3-.1-.8-.2-1.3-.5-2.3-1-3.8-3.3-3.9-3.5-.1-.1-.9-1.2-.9-2.3s.6-1.6.8-1.9c.2-.2.4-.3.6-.3h.4c.1 0 .3 0 .5.4l.7 1.6c.1.1.1.3 0 .4l-.2.4-.3.3c-.1.1-.2.2-.1.4.1.2.6 1 1.3 1.6.9.8 1.6 1 1.9 1.1.2.1.3.1.4-.1l.6-.7c.1-.2.3-.2.5-.1l1.5.7c.2.1.4.2.4.3.1.1.1.6-.1 1.1z" />,
  },
  behance: {
    bg: "#1769ff",
    path: <path fill="currentColor" d="M9.6 11.5c.6-.3 1-.8 1-1.6 0-1.5-1.1-2-2.5-2H4.5v8.2h3.7c1.4 0 2.7-.7 2.7-2.3 0-1-.5-1.8-1.3-2.3zM6.1 9.3h1.6c.6 0 1.1.2 1.1.8 0 .6-.4.9-1 .9H6.1V9.3zm1.8 5.4H6.1v-2.2h1.8c.7 0 1.2.3 1.2 1.1s-.6 1.1-1.2 1.1zM16.4 10.1c-1.8 0-3 1.3-3 3.1 0 1.8 1.2 3.1 3 3.1 1.4 0 2.3-.6 2.7-1.9h-1.4c-.2.5-.7.7-1.2.7-.9 0-1.4-.5-1.4-1.4h4.1c.1-2-.9-3.6-2.8-3.6zm-1.3 2.6c0-.7.5-1.3 1.3-1.3.7 0 1.2.4 1.2 1.3h-2.5zM14.3 8.5h3.3v.8h-3.3z" />,
  },
};

function keyFor(name: string) {
  const n = name.toLowerCase();
  if (n.includes("insta")) return "instagram";
  if (n.includes("tik")) return "tiktok";
  if (n.includes("face") || n === "fb") return "facebook";
  if (n.includes("linked")) return "linkedin";
  if (n.includes("you")) return "youtube";
  if (n === "x" || n.includes("twitter")) return "x";
  if (n.includes("snap")) return "snapchat";
  if (n.includes("pin")) return "pinterest";
  if (n.includes("thread")) return "threads";
  if (n.includes("whats")) return "whatsapp";
  if (n.includes("behance")) return "behance";
  return null;
}

export function PlatformIcon({ name, size = 22, className, muted }: { name: string; size?: number; className?: string; muted?: boolean }) {
  const key = keyFor(name);
  const spec = key ? ICONS[key] : null;
  return (
    <span
      aria-hidden
      title={name}
      className={clsx("inline-flex shrink-0 items-center justify-center overflow-hidden rounded-[28%]", muted && "opacity-40 grayscale", className)}
      style={{ width: size, height: size, background: spec?.bg ?? "#64748b", color: spec?.fg ?? "#ffffff" }}
    >
      <svg viewBox="0 0 24 24" style={{ width: "100%", height: "100%" }} aria-hidden>
        {spec ? (
          spec.path
        ) : (
          <g fill="none" stroke="currentColor" strokeWidth="1.6">
            <circle cx="12" cy="12" r="6.5" />
            <path d="M5.5 12h13M12 5.5c2 2 2 11 0 13M12 5.5c-2 2-2 11 0 13" />
          </g>
        )}
      </svg>
    </span>
  );
}
