/**
 * A short paper-confetti shower when someone finishes something. Light on purpose: ~16–28 pieces, animated only with
 * transform/opacity (GPU), removed after 2.7 s, never two at once, and skipped entirely for people who turn
 * animations off on their device (prefers-reduced-motion). Styles: `.celebrate` in globals.css.
 */
/** The brand's colours plus a few warm ones; pieces are small paper strips and dots, like real confetti. */
const COLORS = ["var(--color-electric)", "var(--color-navy-900)", "#f59e0b", "#10b981", "#e0569b", "#8b5cf6"];
let running = false;

export type Celebration = "small" | "big";

export function celebrate(size: Celebration = "small") {
  if (typeof window === "undefined" || running) return;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  running = true;
  const n = size === "big" ? 40 : 24;
  const box = document.createElement("div");
  box.className = "celebrate";
  box.setAttribute("aria-hidden", "true");
  for (let i = 0; i < n; i++) {
    const s = document.createElement("span");
    const round = Math.random() < 0.3;
    s.style.background = COLORS[Math.floor(Math.random() * COLORS.length)];
    s.style.width = `${round ? 7 : 6 + Math.round(Math.random() * 4)}px`;
    s.style.height = `${round ? 7 : 10 + Math.round(Math.random() * 6)}px`;
    s.style.borderRadius = round ? "999px" : "2px";
    s.style.setProperty("--x", `${4 + Math.random() * 92}vw`);
    s.style.setProperty("--drift", `${Math.round((Math.random() - 0.5) * 180)}px`);
    s.style.setProperty("--rot", `${Math.round((Math.random() - 0.5) * 540)}deg`);
    s.style.setProperty("--delay", `${Math.round(Math.random() * 380)}ms`);
    s.style.setProperty("--dur", `${1400 + Math.round(Math.random() * 900)}ms`);
    box.appendChild(s);
  }
  document.body.appendChild(box);
  window.setTimeout(() => {
    box.remove();
    running = false;
  }, 2700);
}
