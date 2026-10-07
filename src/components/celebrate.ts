/**
 * A short emoji shower when someone finishes something. Light on purpose: ~16–28 emoji, animated only with
 * transform/opacity (GPU), removed after 2.7 s, never two at once, and skipped entirely for people who turn
 * animations off on their device (prefers-reduced-motion). Styles: `.celebrate` in globals.css.
 */
const EMOJI = ["🎉", "✨", "🥳", "⭐", "💙", "🎊", "🙌", "🔥", "💫"];
let running = false;

export type Celebration = "small" | "big";

export function celebrate(size: Celebration = "small") {
  if (typeof window === "undefined" || running) return;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  running = true;
  const n = size === "big" ? 28 : 16;
  const box = document.createElement("div");
  box.className = "celebrate";
  box.setAttribute("aria-hidden", "true");
  for (let i = 0; i < n; i++) {
    const s = document.createElement("span");
    s.textContent = EMOJI[Math.floor(Math.random() * EMOJI.length)];
    s.style.setProperty("--x", `${4 + Math.random() * 92}vw`);
    s.style.setProperty("--drift", `${Math.round((Math.random() - 0.5) * 180)}px`);
    s.style.setProperty("--rot", `${Math.round((Math.random() - 0.5) * 540)}deg`);
    s.style.setProperty("--delay", `${Math.round(Math.random() * 380)}ms`);
    s.style.setProperty("--dur", `${1400 + Math.round(Math.random() * 900)}ms`);
    s.style.fontSize = `${18 + Math.round(Math.random() * (size === "big" ? 20 : 14))}px`;
    box.appendChild(s);
  }
  document.body.appendChild(box);
  window.setTimeout(() => {
    box.remove();
    running = false;
  }, 2700);
}
