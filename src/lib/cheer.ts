/**
 * Small personal touches: each person's team emoji next to their name, and a friendly line that changes
 * every day (the same all day for the same person). Pure functions — no database, nothing stored.
 */
const TEAM_EMOJI: Record<string, string> = {
  leadership: "👑",
  content: "✍️",
  media: "🎬",
  design: "🎨",
  social: "📱",
  account: "🤝",
};

/** The emoji for someone's main team (leadership wins: the CEO gets the crown). */
export function teamEmoji(teams: readonly string[]) {
  const main = teams.includes("leadership") ? "leadership" : teams[0];
  return (main && TEAM_EMOJI[main]) || "✨";
}

const LINES = [
  "Let's make something people stop scrolling for.",
  "Small steps today, a big month at the end.",
  "One thing at a time — you've got this.",
  "Make it bold. Make it NEXORA.",
  "Coffee first, then magic. ☕",
  "Today is a great day to finish things.",
  "Your work is what clients remember.",
  "Ideas are cheap — shipped work is gold.",
  "Done is a beautiful word.",
  "Clear the top of your list and the rest gets easy.",
  "Great content starts before the camera turns on.",
  "Someone is going to love what you make today.",
];

/** A friendly line for this person today. */
export function dailyLine(name: string, isoDay: string) {
  let h = 0;
  for (const ch of `${name}|${isoDay}`) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return LINES[h % LINES.length];
}
