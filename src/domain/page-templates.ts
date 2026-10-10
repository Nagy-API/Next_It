/**
 * Ready docs, whiteboards and sheets for the template library. Pure data — no database.
 *
 * Every `build()` returns FRESH content (new ids each call) that passes `cleanContent` unchanged, so a template
 * can be dropped straight into a new page. Whiteboards are laid out on a grid so nothing overlaps:
 * stickies are 180×150, boxes 180×90, and zones leave a 60px header for their name plus 20px padding.
 */
import {
  newId,
  type DocBlock,
  type DocContent,
  type PageTemplate,
  type SheetColType,
  type SheetContent,
  type WbEdge,
  type WbNode,
  type WbNodeType,
  type WhiteboardContent,
} from "./pages";

/* ------------------------------------------------------------------ */
/* Doc helpers                                                          */
/* ------------------------------------------------------------------ */

const blk = (type: DocBlock["type"], text = ""): DocBlock => ({ id: newId(), type, text });
const h1 = (t: string) => blk("h1", t);
const h2 = (t: string) => blk("h2", t);
const h3 = (t: string) => blk("h3", t);
const p = (t = "") => blk("p", t);
const quote = (t: string) => blk("quote", t);
const divider = () => blk("divider");
const list = (type: "bullet" | "number", t: string, indent = 0): DocBlock => (indent ? { ...blk(type, t), indent } : blk(type, t));
const bullet = (t: string, indent = 0) => list("bullet", t, indent);
const num = (t: string, indent = 0) => list("number", t, indent);
const todo = (t: string, indent = 0): DocBlock => ({ id: newId(), type: "todo", text: t, checked: false, ...(indent ? { indent } : {}) });
const callout = (emoji: string, t: string): DocBlock => ({ id: newId(), type: "callout", text: t, emoji });
const bullets = (items: string[], indent = 0) => items.map((t) => bullet(t, indent));
const nums = (items: string[]) => items.map((t) => num(t));
const todos = (items: string[], indent = 0) => items.map((t) => todo(t, indent));
const doc = (...blocks: (DocBlock | DocBlock[])[]): DocContent => ({ blocks: blocks.flat() });

/* ------------------------------------------------------------------ */
/* Whiteboard helpers                                                   */
/* ------------------------------------------------------------------ */

// Sticky colours (STICKY_COLORS) and shape colours (SHAPE_COLORS), lower-case as cleanContent stores them.
const YELLOW = "#fde68a";
const PINK = "#fbcfe8";
const SKY = "#bfdbfe";
const MINT = "#bbf7d0";
const LILAC = "#ddd6fe";
const PEACH = "#fed7aa";
const GREY = "#e2e8f0";
const BLUE = "#3b82f6";
const VIOLET = "#8b5cf6";
const GREEN = "#10b981";
const AMBER = "#f59e0b";
const RED = "#ef4444";
const ROSE = "#e0569b";
const TEAL = "#14b8a6";
const SLATE = "#64748b";
const NAVY = "#0b1639";

const STICKY_W = 180;
const STICKY_H = 150;
/** Distance between sticky origins inside a zone (sticky + 20px gap). */
const STEP_X = 200;
const STEP_Y = 170;
/** Room for the zone's name above its first sticky. */
const ZONE_HEAD = 60;

function node(type: WbNodeType, x: number, y: number, w: number, h: number, text: string, color: string, more: { fontSize?: number; locked?: boolean } = {}): WbNode {
  const n: WbNode = { id: newId(), type, x, y, w, h, text, color };
  if (more.fontSize !== undefined) n.fontSize = more.fontSize;
  if (more.locked) n.locked = true;
  return n;
}
const sticky = (x: number, y: number, text: string, color = YELLOW, w = STICKY_W, h = STICKY_H) => node("sticky", x, y, w, h, text, color);
const box = (x: number, y: number, text: string, color = BLUE, w = 180, h = 90) => node("rect", x, y, w, h, text, color);
const oval = (x: number, y: number, text: string, color = VIOLET, w = 180, h = 90) => node("ellipse", x, y, w, h, text, color);
const diamond = (x: number, y: number, text: string, color = AMBER, w = 200, h = 130) => node("diamond", x, y, w, h, text, color);
const label = (x: number, y: number, text: string, w = 300, h = 40, fontSize = 18) => node("text", x, y, w, h, text, NAVY, { fontSize });
const title = (x: number, y: number, text: string, w = 900) => label(x, y, text, w, 50, 28);
/** A locked background area with its name at the top. */
const zone = (x: number, y: number, w: number, h: number, text: string, color: string) => node("zone", x, y, w, h, text, color, { locked: true });
/** Width / height of a zone that holds `cols` × `rows` stickies. */
const zoneW = (cols: number) => 20 + cols * STEP_X;
const zoneH = (rows: number) => ZONE_HEAD + rows * STEP_Y;

function edge(a: WbNode, b: WbNode, text?: string, style?: "arrow" | "line"): WbEdge {
  const e: WbEdge = { id: newId(), from: a.id, to: b.id };
  if (text) e.label = text;
  if (style === "line") e.style = "line";
  return e;
}
const board = (nodes: WbNode[], edges: WbEdge[] = []): WhiteboardContent => ({ nodes, edges });

/** Stickies laid out inside a zone, row by row, with 20px padding under the zone's name. */
function fill(z: WbNode, texts: string[], color: string, cols = Math.max(1, Math.floor((z.w - 20) / STEP_X))): WbNode[] {
  return texts.map((t, i) => sticky(z.x + 20 + (i % cols) * STEP_X, z.y + ZONE_HEAD + Math.floor(i / cols) * STEP_Y, t, color));
}

type Quad = { name: string; color: string; sticky: string; notes: string[] };
/** A 2×2 matrix: four zones (top-left, top-right, bottom-left, bottom-right) with axis labels around them. */
function matrix(o: { title: string; hint: string; quads: [Quad, Quad, Quad, Quad]; top: string; bottom: string; left: string; right: string; yAxis: string; xAxis: string }): WhiteboardContent {
  const W = zoneW(2);
  const H = zoneH(2);
  const G = 20;
  const pos: [number, number][] = [[0, 0], [W + G, 0], [0, H + G], [W + G, H + G]];
  const nodes: WbNode[] = [title(0, -120, o.title), label(0, -66, o.hint, 900, 40, 15)];
  o.quads.forEach((q, i) => {
    const z = zone(pos[i][0], pos[i][1], W, H, q.name, q.color);
    nodes.push(z, ...fill(z, q.notes.slice(0, 4), q.sticky));
  });
  nodes.push(
    label(-220, H / 2 - 20, o.top, 200, 40, 16),
    label(-220, H - 10, o.yAxis, 200, 60, 18),
    label(-220, H + G + H / 2 - 20, o.bottom, 200, 40, 16),
    label(W / 2 - 110, 2 * H + G + 20, o.left, 220, 40, 16),
    label(W + G + W / 2 - 110, 2 * H + G + 20, o.right, 220, 40, 16),
    label(W - 150, 2 * H + G + 70, o.xAxis, 340, 40, 18),
  );
  return board(nodes);
}

type Block = { name: string; color: string; notes: string[] };
/**
 * The 9-block canvas layout shared by the Lean canvas and the Business model canvas:
 * five columns (the 2nd and 4th split in two) over two wide blocks at the bottom.
 */
function canvas9(heading: string, hint: string, b: [Block, Block, Block, Block, Block, Block, Block, Block, Block], stickyColor: string): WhiteboardContent {
  const CW = 240;
  const G = 10;
  const TALL = 540;
  const HALF = (TALL - G) / 2;
  const x = (c: number) => c * (CW + G);
  const rects: [number, number, number, number][] = [
    [x(0), 0, CW, TALL],
    [x(1), 0, CW, HALF],
    [x(1), HALF + G, CW, HALF],
    [x(2), 0, CW, TALL],
    [x(3), 0, CW, HALF],
    [x(3), HALF + G, CW, HALF],
    [x(4), 0, CW, TALL],
    [0, TALL + G, (5 * CW + 4 * G - G) / 2, 240],
    [(5 * CW + 4 * G + G) / 2, TALL + G, (5 * CW + 4 * G - G) / 2, 240],
  ];
  const nodes: WbNode[] = [title(0, -110, heading), label(0, -60, hint, 1000, 40, 15)];
  b.forEach((blockDef, i) => {
    const [zx, zy, zw, zh] = rects[i];
    const z = zone(zx, zy, zw, zh, blockDef.name, blockDef.color);
    const cols = Math.max(1, Math.floor((zw - 20) / STEP_X));
    const rows = Math.max(1, Math.floor((zh - ZONE_HEAD) / STEP_Y));
    nodes.push(z, ...fill(z, blockDef.notes.slice(0, cols * rows), stickyColor, cols).map((s) => ({ ...s, x: zw < zoneW(2) ? zx + (zw - STICKY_W) / 2 : s.x })));
  });
  return board(nodes);
}

/* ------------------------------------------------------------------ */
/* Sheet helpers                                                        */
/* ------------------------------------------------------------------ */

type ColSpec = [name: string, type: SheetColType, width?: number];
/**
 * Columns and rows. In a cell, `{r}` becomes the row's own number and `{p}` the row above
 * (formulas use A1 refs: A = first column, row 1 = first row). Empty strings stay empty.
 */
function sheet(cols: ColSpec[], rows: string[][]): SheetContent {
  const c = cols.map(([name, type, width = 140]) => ({ id: newId(), name, width, type }));
  return {
    cols: c,
    rows: rows.map((vals, i) => {
      const cells: Record<string, string> = {};
      vals.forEach((v, j) => {
        const s = v.split("{r}").join(String(i + 1)).split("{p}").join(String(i));
        if (s && c[j]) cells[c[j].id] = s;
      });
      return { id: newId(), cells };
    }),
  };
}
const blanks = (n: number): string[][] => Array.from({ length: n }, () => []);

/* ------------------------------------------------------------------ */
/* Whiteboards                                                          */
/* ------------------------------------------------------------------ */

const WHITEBOARDS: PageTemplate[] = [
  {
    key: "bcg-matrix",
    kind: "whiteboard",
    category: "Strategy",
    name: "BCG matrix",
    icon: "📊",
    description: "Sort services or brands by market growth and market share to decide where to invest.",
    build: () =>
      matrix({
        title: "BCG matrix",
        hint: "Put each service, package or platform in one box. Then decide: invest, keep, question or drop.",
        quads: [
          { name: "⭐ Stars", color: AMBER, sticky: YELLOW, notes: ["Reels packages — fast-growing market and we lead it", "Action: invest — best editors, faster delivery"] },
          { name: "❓ Question marks", color: VIOLET, sticky: LILAC, notes: ["TikTok management — booming, but our share is small", "Action: test 2 clients for 3 months, then decide"] },
          { name: "🐄 Cash cows", color: GREEN, sticky: MINT, notes: ["Monthly static posts — steady income, little growth", "Action: keep it efficient, templates, no extra cost"] },
          { name: "🐕 Dogs", color: SLATE, sticky: GREY, notes: ["Facebook-only packages — shrinking and low share", "Action: phase out or bundle into bigger plans"] },
        ],
        top: "High growth",
        bottom: "Low growth",
        yAxis: "↕ Market growth",
        left: "High share",
        right: "Low share",
        xAxis: "↔ Relative market share",
      }),
  },
  {
    key: "impact-effort-matrix",
    kind: "whiteboard",
    category: "Project management",
    name: "Priority matrix (impact vs effort)",
    icon: "🎯",
    description: "Place every idea by impact and effort to find quick wins and avoid time sinks.",
    build: () =>
      matrix({
        title: "Priority matrix: impact vs effort",
        hint: "One idea per sticky. Do quick wins now, plan big bets, squeeze in fill-ins, avoid time sinks.",
        quads: [
          { name: "⚡ Quick wins", color: GREEN, sticky: MINT, notes: ["Reuse the best reel as 3 stories", "Pin the top 3 posts on every profile"] },
          { name: "🚀 Big bets", color: BLUE, sticky: SKY, notes: ["Monthly podcast for the agency", "New website with case studies"] },
          { name: "🧩 Fill-ins", color: AMBER, sticky: YELLOW, notes: ["Tidy the Drive folders", "Update highlight covers"] },
          { name: "🕳️ Time sinks", color: RED, sticky: PINK, notes: ["Custom music for every post", "Redesigning old posts nobody sees"] },
        ],
        top: "High impact",
        bottom: "Low impact",
        yAxis: "↕ Impact",
        left: "Low effort",
        right: "High effort",
        xAxis: "↔ Effort",
      }),
  },
  {
    key: "eisenhower-matrix",
    kind: "whiteboard",
    category: "Personal",
    name: "Eisenhower matrix",
    icon: "⏳",
    description: "Split your tasks by urgent and important: do, schedule, delegate or drop.",
    build: () =>
      matrix({
        title: "Eisenhower matrix",
        hint: "Write each task on a sticky and drag it to the right box. Be honest about what's really important.",
        quads: [
          { name: "🔥 Do first", color: RED, sticky: PINK, notes: ["Fix the caption error in today's post", "Send the shoot call sheet for tomorrow"] },
          { name: "📅 Schedule", color: BLUE, sticky: SKY, notes: ["Plan next month's content", "Learn the new editing preset"] },
          { name: "🤝 Delegate", color: AMBER, sticky: YELLOW, notes: ["Book the studio", "Collect the client's logo files"] },
          { name: "🗑️ Don't do", color: SLATE, sticky: GREY, notes: ["Endless scrolling 'for research'", "Meetings without an agenda"] },
        ],
        top: "Important",
        bottom: "Not important",
        yAxis: "↕ Importance",
        left: "Urgent",
        right: "Not urgent",
        xAxis: "↔ Urgency",
      }),
  },
  {
    key: "swot-analysis",
    kind: "whiteboard",
    category: "Strategy",
    name: "SWOT analysis",
    icon: "🧭",
    description: "Strengths, weaknesses, opportunities and threats for a brand, client or the agency.",
    build: () =>
      matrix({
        title: "SWOT analysis",
        hint: "Inside (what we control) on top, outside (the market) at the bottom. Keep each point short and specific.",
        quads: [
          { name: "💪 Strengths", color: GREEN, sticky: MINT, notes: ["In-house shooting and editing team", "Fast turnaround on reels"] },
          { name: "🩹 Weaknesses", color: AMBER, sticky: YELLOW, notes: ["Few case studies with numbers", "Depends on a small number of clients"] },
          { name: "🌱 Opportunities", color: BLUE, sticky: SKY, notes: ["Brands moving budget to short video", "Ramadan and summer campaigns"] },
          { name: "⚠️ Threats", color: RED, sticky: PINK, notes: ["Freelancers with lower prices", "Algorithm changes cutting reach"] },
        ],
        top: "Internal",
        bottom: "External",
        yAxis: "↕ Where it comes from",
        left: "Helpful",
        right: "Harmful",
        xAxis: "↔ Effect",
      }),
  },
  {
    key: "flowchart",
    kind: "whiteboard",
    category: "Operations",
    name: "Flowchart",
    icon: "🔀",
    description: "A process from start to end with steps and a yes/no decision.",
    build: () => {
      const start = oval(400, 0, "Start: brief arrives", GREEN, 180, 80);
      const s1 = box(400, 140, "Read the brief and ask questions");
      const s2 = box(400, 290, "Write the script");
      const d = diamond(390, 440, "Client approves the script?");
      const s3 = box(400, 630, "Shoot and edit");
      const s4 = box(400, 780, "Schedule and publish");
      const end = oval(400, 930, "End: live ✅", GREEN, 180, 80);
      const fix = box(700, 460, "Revise with the client's notes", AMBER);
      return board(
        [
          title(250, -100, "Flowchart: from brief to published reel", 600),
          start,
          s1,
          s2,
          d,
          s3,
          s4,
          end,
          fix,
          sticky(720, 0, "Shapes: oval = start / end, box = a step, diamond = a yes / no question. Drag to add your own.", GREY, 220, 150),
        ],
        [edge(start, s1), edge(s1, s2), edge(s2, d), edge(d, s3, "Yes"), edge(d, fix, "No"), edge(fix, s2, "Send again"), edge(s3, s4), edge(s4, end)],
      );
    },
  },
  {
    key: "mind-map",
    kind: "whiteboard",
    category: "Creative",
    name: "Mind map",
    icon: "🧠",
    description: "A central topic with six branches and ideas growing out of each.",
    build: () => {
      const center = oval(500, 380, "Ramadan campaign (your topic)", NAVY, 240, 120);
      const branches: [number, number, string, string, string, [string, string]][] = [
        [260, 160, "Audience", BLUE, SKY, ["Families planning iftar", "Young people up late"]],
        [180, 440, "Content ideas", ROSE, PINK, ["Daily iftar countdown", "Behind the scenes"]],
        [260, 720, "Channels", TEAL, MINT, ["Instagram reels", "TikTok + stories"]],
        [980, 160, "Budget", AMBER, YELLOW, ["Production", "Paid ads"]],
        [1060, 440, "Team", VIOLET, LILAC, ["Script + shoot", "Editing + design"]],
        [980, 720, "Timeline", GREEN, MINT, ["Brief by week 1", "Live before day 1"]],
      ];
      const nodes: WbNode[] = [title(200, -80, "Mind map — write your topic in the middle, then grow each branch", 1000), center];
      const edges: WbEdge[] = [];
      for (const [cx, cy, text, color, light, subs] of branches) {
        const b = box(cx - 90, cy - 35, text, color, 180, 70);
        nodes.push(b);
        edges.push(edge(center, b, undefined, "line"));
        const sx = cx < 620 ? cx - 290 : cx + 120;
        subs.forEach((s, i) => {
          const n = box(sx, cy - 65 + i * 80, s, light, 170, 50);
          nodes.push(n);
          edges.push(edge(b, n, undefined, "line"));
        });
      }
      return board(nodes, edges);
    },
  },
  {
    key: "concept-map",
    kind: "whiteboard",
    category: "Strategy",
    name: "Concept map",
    icon: "🕸️",
    description: "Ideas connected by labelled arrows that explain how they relate.",
    build: () => {
      const brand = oval(510, 0, "Brand", NAVY, 200, 90);
      const audience = box(160, 200, "Audience", BLUE, 180, 80);
      const tone = box(520, 200, "Tone of voice", VIOLET, 180, 80);
      const goals = box(880, 200, "Goals", GREEN, 180, 80);
      const platforms = box(160, 400, "Platforms", BLUE, 180, 80);
      const captions = box(520, 400, "Captions & hooks", VIOLET, 180, 80);
      const kpis = box(880, 400, "KPIs", GREEN, 180, 80);
      const formats = box(340, 600, "Content formats", ROSE, 180, 80);
      const reels = box(100, 800, "Reels", PINK, 180, 80);
      const carousels = box(340, 800, "Carousels", PINK, 180, 80);
      const stories = box(580, 800, "Stories", PINK, 180, 80);
      return board(
        [title(100, -100, "Concept map — boxes are ideas, arrow labels say how they connect"), brand, audience, tone, goals, platforms, captions, kpis, formats, reels, carousels, stories],
        [
          edge(brand, audience, "speaks to"),
          edge(brand, tone, "has a"),
          edge(brand, goals, "works toward"),
          edge(audience, platforms, "spends time on"),
          edge(tone, captions, "shapes"),
          edge(goals, kpis, "measured by"),
          edge(platforms, formats, "favour"),
          edge(captions, formats, "go with"),
          edge(formats, kpis, "move"),
          edge(formats, reels, "e.g.", "line"),
          edge(formats, carousels, "e.g.", "line"),
          edge(formats, stories, "e.g.", "line"),
        ],
      );
    },
  },
  {
    key: "customer-journey-map",
    kind: "whiteboard",
    category: "Marketing",
    name: "Customer journey map",
    icon: "🗺️",
    description: "What a customer does, sees and feels from first seeing the brand to recommending it.",
    build: () => {
      const stages: [string, string, string[]][] = [
        ["👀 Awareness", BLUE, ["Sees a reel from a friend's share", "Instagram reels, TikTok, ads", "Curious, but not sure yet 🤔", "Strong hook in the first 2 seconds"]],
        ["🔎 Consideration", VIOLET, ["Visits the profile, reads comments", "Profile grid, highlights, reviews", "Wants proof it works", "Pin reviews and before / after posts"]],
        ["🛒 Purchase", GREEN, ["Sends a DM or orders online", "DMs, WhatsApp, website", "Excited, a bit worried about delivery", "Fast replies, clear prices, easy checkout"]],
        ["🔁 Retention", AMBER, ["Uses the product, follows the page", "Stories, follow-up message, offers", "Happy if it arrives as promised", "Thank-you message, how-to content"]],
        ["📣 Advocacy", ROSE, ["Posts a story and tags the brand", "UGC, reviews, referrals", "Proud to recommend it 💛", "Repost UGC, referral code, giveaways"]],
      ];
      const rows: [string, string][] = [
        ["Actions", YELLOW],
        ["Touchpoints", SKY],
        ["Feelings", PINK],
        ["Opportunities", MINT],
      ];
      const W = zoneW(1);
      const H = zoneH(rows.length) + 10;
      const nodes: WbNode[] = [title(0, -110, "Customer journey map"), label(0, -60, "Persona: write who this journey is for, e.g. “Mariam, 27, first-time buyer”.", 1000, 40, 15)];
      stages.forEach(([name, color, notes], i) => {
        const z = zone(200 + i * (W + 20), 0, W, H, name, color);
        nodes.push(z);
        notes.forEach((t, r) => nodes.push(sticky(z.x + 20, z.y + ZONE_HEAD + r * STEP_Y, t, rows[r][1])));
      });
      rows.forEach(([name], r) => nodes.push(label(0, ZONE_HEAD + r * STEP_Y + 55, name, 180, 40, 18)));
      return board(nodes);
    },
  },
  {
    key: "brainstorm",
    kind: "whiteboard",
    category: "Creative",
    name: "Brainstorm",
    icon: "💡",
    description: "A sticky wall around one question. Fill it fast, then group and vote.",
    build: () => {
      const cols = [0, 220, 440, 660, 880];
      const ideas = [
        ["Day-in-the-life reel with the founder", YELLOW],
        ["“Guess the price” street interviews", PINK],
        ["Customer story in 30 seconds", SKY],
        ["Before / after carousel", MINT],
        ["Myth vs fact series", LILAC],
        ["Trend audio + product twist", PEACH],
        ["Your idea…", YELLOW],
        ["Your idea…", PINK],
        ["Your idea…", SKY],
        ["Your idea…", MINT],
        ["Your idea…", LILAC],
        ["Your idea…", PEACH],
      ];
      const spots: [number, number][] = [...cols.map((x): [number, number] => [x, 0]), [0, 190], [880, 190], ...cols.map((x): [number, number] => [x, 380])];
      return board([
        title(0, -110, "Brainstorm"),
        label(0, -60, "Rules: no bad ideas · one idea per sticky · build on others · vote with a ⭐ at the end", 1060, 40, 15),
        oval(330, 195, "Question: how can we make the next month of reels feel new?", NAVY, 360, 140),
        ...ideas.map(([t, c], i) => sticky(spots[i][0], spots[i][1], t, c)),
      ]);
    },
  },
  {
    key: "retrospective",
    kind: "whiteboard",
    category: "Project management",
    name: "Retrospective",
    icon: "🔁",
    description: "Look back as a team: what went well, what to improve, and who does what next.",
    build: () => {
      const W = zoneW(2);
      const H = zoneH(2) + 10;
      const cols: [string, string, string, string[]][] = [
        ["😀 Went well", GREEN, MINT, ["All posts went out on time", "Client loved the new reel style", "Shoot day was well organised"]],
        ["🤔 To improve", AMBER, YELLOW, ["Too many rounds of changes", "Brief arrived late", "Files scattered across chats"]],
        ["✅ Action items", BLUE, SKY, ["Brief template for every client — owner: Ammar", "One Drive folder per month — owner: Jana", "Max 2 change rounds in the contract"]],
      ];
      const nodes: WbNode[] = [title(0, -110, "Retrospective — sprint / month: ______"), label(0, -60, "10 min silent writing → read aloud → group similar stickies → agree on 2–3 actions with an owner.", 1300, 40, 15)];
      cols.forEach(([name, color, light, notes], i) => {
        const z = zone(i * (W + 20), 0, W, H, name, color);
        nodes.push(z, ...fill(z, notes, light));
      });
      return board(nodes);
    },
  },
  {
    key: "lean-canvas",
    kind: "whiteboard",
    category: "Strategy",
    name: "Lean canvas",
    icon: "🧪",
    description: "A one-page plan for a new product or service in nine blocks.",
    build: () =>
      canvas9(
        "Lean canvas",
        "Fill it in this order: problem → customer segments → unique value → solution → channels → revenue → costs → metrics → unfair advantage.",
        [
          { name: "Problem", color: RED, notes: ["Small brands post without a plan", "Content looks cheap and gets no reach"] },
          { name: "Solution", color: BLUE, notes: ["Monthly content plan + production in one package"] },
          { name: "Key metrics", color: TEAL, notes: ["Posts on time %, reach, clients renewing"] },
          { name: "Unique value proposition", color: VIOLET, notes: ["Agency-quality reels at a small-brand price", "Plan, shoot, edit, post: one team"] },
          { name: "Unfair advantage", color: AMBER, notes: ["In-house studio and a fast editing team"] },
          { name: "Channels", color: BLUE, notes: ["Instagram, referrals, events"] },
          { name: "Customer segments", color: GREEN, notes: ["Cafés, clinics and beauty brands in Cairo", "Early adopters: brands that just opened"] },
          { name: "Cost structure", color: SLATE, notes: ["Salaries, equipment, studio rent", "Ads to find new clients"] },
          { name: "Revenue streams", color: GREEN, notes: ["Monthly retainers", "One-off shoots and campaigns"] },
        ],
        YELLOW,
      ),
  },
  {
    key: "business-model-canvas",
    kind: "whiteboard",
    category: "Strategy",
    name: "Business model canvas",
    icon: "🏗️",
    description: "How a business creates, delivers and earns from value, in nine blocks.",
    build: () =>
      canvas9(
        "Business model canvas",
        "Start in the middle with the value you offer, then the customers (right) and how you deliver it (left).",
        [
          { name: "Key partners", color: SLATE, notes: ["Freelance photographers", "Studio and equipment rentals"] },
          { name: "Key activities", color: BLUE, notes: ["Planning, shooting, editing, posting"] },
          { name: "Key resources", color: BLUE, notes: ["Creative team, cameras, studio"] },
          { name: "Value propositions", color: VIOLET, notes: ["Content that looks premium and goes out on time", "One team from idea to report"] },
          { name: "Customer relationships", color: ROSE, notes: ["Dedicated account manager, monthly report"] },
          { name: "Channels", color: ROSE, notes: ["Instagram, referrals, website"] },
          { name: "Customer segments", color: GREEN, notes: ["F&B and beauty brands", "Clinics and academies"] },
          { name: "Cost structure", color: AMBER, notes: ["Team salaries", "Equipment, studio, ads"] },
          { name: "Revenue streams", color: GREEN, notes: ["Monthly retainers", "Campaigns and one-off shoots"] },
        ],
        SKY,
      ),
  },
  {
    key: "empathy-map",
    kind: "whiteboard",
    category: "Marketing",
    name: "Empathy map",
    icon: "🫶",
    description: "What your audience says, thinks, does and feels, around one persona.",
    build: () => {
      const W = zoneW(2);
      const H = zoneH(2);
      const says = zone(0, 0, W, H, "💬 Says", BLUE);
      const thinks = zone(W + 20, 0, W, H, "💭 Thinks", VIOLET);
      const does = zone(0, H + 20, W, H, "🏃 Does", GREEN);
      const feels = zone(W + 20, H + 20, W, H, "❤️ Feels", ROSE);
      const pains = zone(0, 2 * H + 60, W, zoneH(1) + 20, "😣 Pains", RED);
      const gains = zone(W + 20, 2 * H + 60, W, zoneH(1) + 20, "🌟 Gains", TEAL);
      const s = (x: number, y: number, t: string, c: string) => sticky(x, y, t, c);
      return board([
        title(0, -110, "Empathy map"),
        label(0, -60, "Use real quotes from comments, DMs and interviews. Keep the stickies away from the persona in the middle.", 1000, 40, 15),
        says,
        thinks,
        does,
        feels,
        pains,
        gains,
        s(20, 60, "“Is this worth the price?”", SKY),
        s(220, 60, "“My friend recommended it.”", SKY),
        s(20, 230, "Asks about delivery time in DMs", SKY),
        s(W + 40, 60, "Wants to look put-together", LILAC),
        s(W + 240, 60, "Worried it won't work for her", LILAC),
        s(W + 240, 230, "Trusts real reviews more than ads", LILAC),
        s(20, H + 80, "Watches reels at night", MINT),
        s(20, H + 250, "Saves posts to buy later", MINT),
        s(220, H + 250, "Compares 3 brands before buying", MINT),
        s(W + 240, H + 80, "Excited by new launches", PINK),
        s(W + 40, H + 250, "Annoyed by slow replies", PINK),
        s(W + 240, H + 250, "Happy when a brand remembers her", PINK),
        oval(W - 90, H - 60, "Persona: Mariam, 27", NAVY, 200, 140),
        ...fill(pains, ["Hidden prices", "Late deliveries"], PINK),
        ...fill(gains, ["Feels confident", "Gets compliments"], MINT),
      ]);
    },
  },
  {
    key: "user-persona",
    kind: "whiteboard",
    category: "Marketing",
    name: "User persona",
    icon: "👤",
    description: "One clear picture of the person a brand talks to: who, goals, frustrations and habits.",
    build: () => {
      const W = zoneW(2);
      const H = zoneH(1) + 30;
      const blocks: [string, string, string, [string, string]][] = [
        ["🙋 About", BLUE, SKY, ["Mariam, 27, HR specialist, lives in New Cairo", "Single, earns well, shops online weekly"]],
        ["🎯 Goals", GREEN, MINT, ["Grow her career and look professional", "Find brands she can trust"]],
        ["😤 Frustrations", RED, PINK, ["Ads that over-promise", "No clear prices, slow replies"]],
        ["📱 Media habits", VIOLET, LILAC, ["Instagram at night, TikTok on the commute", "Follows HR and lifestyle creators"]],
        ["💛 Brands she loves", AMBER, YELLOW, ["Brands with real reviews and a friendly tone", "Quick, helpful customer service"]],
        ["🤝 How we help her", TEAL, MINT, ["Short how-to reels and honest proof", "Clear offers and fast DMs"]],
      ];
      const nodes: WbNode[] = [box(0, 0, "Persona: Mariam, 27 — “I want brands that just get it right.”", NAVY, 3 * W + 20, 80)];
      blocks.forEach(([name, color, light, notes], i) => {
        const z = zone((i % 3) * (W + 10), 100 + Math.floor(i / 3) * (H + 10), W, H, name, color);
        nodes.push(z, ...fill(z, notes, light));
      });
      return board(nodes);
    },
  },
  {
    key: "content-pillars",
    kind: "whiteboard",
    category: "Marketing",
    name: "Content pillars",
    icon: "🏛️",
    description: "A brand's 5 content pillars with a share of the mix and example post ideas.",
    build: () => {
      const brand = oval(450, 0, "Your brand (e.g. Vanilla Roza)", NAVY, 260, 100);
      const pillars: [string, string, string, string[]][] = [
        ["📚 Educate (30%)", BLUE, SKY, ["Reel: 3 mistakes people make with…", "Carousel: step-by-step guide", "Story quiz: myth or fact?"]],
        ["✨ Inspire (25%)", VIOLET, LILAC, ["Reel: before / after transformation", "Static: quote from the founder", "Customer success story"]],
        ["🎬 Behind the scenes (20%)", AMBER, YELLOW, ["Reel: how the product is made", "Story: a day at the shop", "Meet the team carousel"]],
        ["🫂 Community (15%)", TEAL, MINT, ["Repost customer stories (UGC)", "Q&A sticker in stories", "Giveaway with a partner"]],
        ["🛍️ Promote (10%)", ROSE, PINK, ["Static: new launch", "Reel: offer with a clear CTA", "Story countdown to a sale"]],
      ];
      const nodes: WbNode[] = [title(0, -100, "Content pillars — what we post about, and how much of each"), brand];
      const edges: WbEdge[] = [];
      pillars.forEach(([name, color, light, ideas], i) => {
        const x = i * 240;
        const b = box(x, 180, name, color, 200, 80);
        nodes.push(b);
        edges.push(edge(brand, b));
        ideas.forEach((t, j) => nodes.push(sticky(x + 10, 300 + j * STEP_Y, t, light)));
      });
      nodes.push(label(0, 830, "Tip: check every month that the real posts match these percentages.", 1160, 40, 15));
      return board(nodes, edges);
    },
  },
  {
    key: "campaign-plan",
    kind: "whiteboard",
    category: "Marketing",
    name: "Campaign plan",
    icon: "📣",
    description: "Goal → audience → message → channels → KPIs, with guiding questions under each step.",
    build: () => {
      const steps: [string, string, string, [string, string]][] = [
        ["🎯 Goal", GREEN, MINT, ["What should change? e.g. +300 orders in 30 days", "One goal only. Make it measurable."]],
        ["👥 Audience", BLUE, SKY, ["Who exactly? e.g. women 22–35 in Cairo", "Where are they and what do they care about?"]],
        ["💬 Message", VIOLET, LILAC, ["One sentence they should remember", "Proof: reviews, numbers, demo"]],
        ["📡 Channels", AMBER, YELLOW, ["Instagram reels + stories, TikTok, influencers", "Paid budget per channel"]],
        ["📈 KPIs", ROSE, PINK, ["Reach, saves, DMs, orders, cost per order", "Check weekly, report at the end"]],
      ];
      const nodes: WbNode[] = [title(0, -100, "Campaign plan: ______ (name and dates)")];
      const edges: WbEdge[] = [];
      let prev: WbNode | null = null;
      steps.forEach(([name, color, light, notes], i) => {
        const x = i * 260;
        const b = box(x, 0, name, color, 200, 90);
        nodes.push(b, ...notes.map((t, j) => sticky(x + 10, 140 + j * STEP_Y, t, light)));
        if (prev) edges.push(edge(prev, b));
        prev = b;
      });
      nodes.push(label(0, 490, "One goal, one audience, one message per campaign. Everything else supports them.", 1240, 40, 15));
      return board(nodes, edges);
    },
  },
  {
    key: "kanban-sketch",
    kind: "whiteboard",
    category: "Project management",
    name: "Kanban sketch",
    icon: "🗂️",
    description: "To do, Doing, Done columns with stickies you drag across.",
    build: () => {
      const W = zoneW(1);
      const H = zoneH(4) + 10;
      const cols: [string, string, string, string[]][] = [
        ["📝 To do", SLATE, GREY, ["Write November scripts", "Book the studio", "Collect client logos", "Plan the giveaway"]],
        ["🚧 Doing (max 3)", BLUE, SKY, ["Edit Blissify reel v2", "Design the launch carousel"]],
        ["✅ Done", GREEN, MINT, ["Shoot for OG Hub", "October report sent", "Captions approved"]],
      ];
      const nodes: WbNode[] = [title(0, -100, "Kanban — move stickies left to right", 700)];
      cols.forEach(([name, color, light, notes], i) => {
        const z = zone(i * (W + 20), 0, W, H, name, color);
        nodes.push(z, ...fill(z, notes, light));
      });
      return board(nodes);
    },
  },
  {
    key: "org-chart",
    kind: "whiteboard",
    category: "HR",
    name: "Org chart",
    icon: "🏢",
    description: "Who reports to whom: leadership, departments and roles.",
    build: () => {
      const ceo = box(460, 0, "CEO", NAVY, 200, 80);
      const depts: [string, string, string, string[]][] = [
        ["Content", BLUE, SKY, ["Content lead", "Content creators"]],
        ["Media production", VIOLET, LILAC, ["Production lead", "Video editor", "Graphic designer"]],
        ["Social media", ROSE, PINK, ["Social media specialist"]],
        ["Account management", GREEN, MINT, ["Account manager"]],
        ["Operations & IT", AMBER, YELLOW, ["IT admin", "Finance & admin"]],
      ];
      const nodes: WbNode[] = [title(0, -100, "Org chart — replace the roles with names"), ceo];
      const edges: WbEdge[] = [];
      depts.forEach(([name, color, light, roles], i) => {
        const x = i * 230;
        const d = box(x, 180, name, color, 200, 80);
        nodes.push(d);
        edges.push(edge(ceo, d, undefined, "line"));
        roles.forEach((r, j) => {
          const n = box(x + 10, 340 + j * 100, r, light, 180, 70);
          nodes.push(n);
          edges.push(edge(j === 0 ? d : nodes[nodes.length - 2], n, undefined, "line"));
        });
      });
      return board(nodes, edges);
    },
  },
  {
    key: "roadmap-timeline",
    kind: "whiteboard",
    category: "Project management",
    name: "Timeline / roadmap",
    icon: "🛣️",
    description: "A year in four quarters with milestones, colour-coded by workstream.",
    build: () => {
      const W = zoneW(2);
      const H = zoneH(3) + 10;
      const quarters: [string, string, [string, string][]][] = [
        ["Q1 · Jan – Mar", BLUE, [["Plan the year's campaigns", YELLOW], ["Onboard 2 new clients", SKY], ["Hire a motion designer", MINT]]],
        ["Q2 · Apr – Jun", VIOLET, [["Ramadan & Eid campaigns", YELLOW], ["Quarterly client reviews", SKY], ["Team training: lighting", MINT], ["New studio set", YELLOW]]],
        ["Q3 · Jul – Sep", AMBER, [["Summer campaign", YELLOW], ["Case studies on the website", SKY], ["Mid-year reviews", MINT]]],
        ["Q4 · Oct – Dec", GREEN, [["Black Friday / year-end sales", YELLOW], ["Renewals for next year", SKY], ["Year wrap-up & party 🎉", MINT]]],
      ];
      const nodes: WbNode[] = [title(0, -100, "Roadmap 2027")];
      quarters.forEach(([name, color, ms], i) => {
        const z = zone(i * (W + 20), 0, W, H, name, color);
        nodes.push(z, ...ms.map(([t, c], j) => sticky(z.x + 20 + (j % 2) * STEP_X, ZONE_HEAD + Math.floor(j / 2) * STEP_Y, t, c)));
      });
      nodes.push(label(0, H + 30, "Yellow = content & campaigns · Blue = clients · Green = team", 900, 40, 16));
      return board(nodes);
    },
  },
  {
    key: "fishbone",
    kind: "whiteboard",
    category: "Operations",
    name: "Fishbone (cause & effect)",
    icon: "🐟",
    description: "Find the root causes of a problem, grouped into six categories.",
    build: () => {
      const head = box(1300, 300, "Problem: reels are delivered late", RED, 240, 120);
      const tail = label(0, 340, "Causes →", 140, 40, 18);
      const joints = [500, 860, 1220].map((x) => oval(x, 350, "", SLATE, 20, 20));
      const tops: [number, string, [string, string]][] = [
        [200, "People", ["Editor has too many brands", "No backup when someone is off"]],
        [560, "Process", ["Too many change rounds", "No clear approval owner"]],
        [920, "Tools", ["Slow exports on old laptop", "Files spread over chats"]],
      ];
      const bottoms: [number, string, [string, string]][] = [
        [200, "Brief & info", ["Brief arrives late", "Missing logos and assets"]],
        [560, "Environment", ["Shoot day moved by weather", "Power cuts in the studio"]],
        [920, "Measurement", ["Deadlines not tracked", "Nobody sees the delay early"]],
      ];
      const nodes: WbNode[] = [title(0, -100, "Fishbone — ask “why?” until you reach the root cause"), tail, ...joints, head];
      const edges: WbEdge[] = [edge(tail, joints[0], undefined, "line"), edge(joints[0], joints[1], undefined, "line"), edge(joints[1], joints[2], undefined, "line"), edge(joints[2], head)];
      tops.forEach(([x, name, causes], i) => {
        const c = box(x, 0, name, BLUE, 180, 70);
        nodes.push(c, ...causes.map((t, j) => sticky(x - 80, 90 + j * 105, t, YELLOW, 160, 95)));
        edges.push(edge(c, joints[i], undefined, "line"));
      });
      bottoms.forEach(([x, name, causes], i) => {
        const c = box(x, 650, name, VIOLET, 180, 70);
        nodes.push(c, ...causes.map((t, j) => sticky(x - 80, 440 + j * 105, t, LILAC, 160, 95)));
        edges.push(edge(c, joints[i], undefined, "line"));
      });
      return board(nodes, edges);
    },
  },
  {
    key: "venn-diagram",
    kind: "whiteboard",
    category: "Personal",
    name: "Venn diagram",
    icon: "⭕",
    description: "Three overlapping circles to find the sweet spot where they meet.",
    build: () =>
      board([
        title(0, -100, "Venn diagram — find the sweet spot"),
        oval(0, 0, "", BLUE, 420, 420),
        oval(260, 0, "", ROSE, 420, 420),
        oval(130, 225, "", GREEN, 420, 420),
        label(40, 125, "What I'm great at", 140, 50, 16),
        label(500, 125, "What people need", 140, 50, 16),
        label(270, 545, "What I love doing", 140, 50, 16),
        label(270, 70, "Useful skill", 140, 40, 14),
        label(130, 345, "Hobby", 140, 40, 14),
        label(410, 345, "Calling", 140, 40, 14),
        label(270, 265, "⭐ Sweet spot", 140, 50, 18),
        sticky(-230, 40, "Great at: e.g. editing, storytelling, speaking Arabic & English", SKY),
        sticky(720, 40, "People need: e.g. short videos, clear explanations", PINK),
        sticky(720, 470, "I love: e.g. travel, food, teaching others", MINT),
      ]),
  },
  {
    key: "storyboard",
    kind: "whiteboard",
    category: "Creative",
    name: "Shoot plan / storyboard",
    icon: "🎞️",
    description: "Six frames for a reel with shot, movement and audio notes, plus the shoot info.",
    build: () => {
      const frames: [string, string][] = [
        ["Frame 1 · Hook (0–3s)\nClose-up: hand opens the product box", "Shot: close-up · Move: fast push-in · Audio: VO “You've been doing it wrong…”"],
        ["Frame 2 · Problem (3–7s)\nMedium: person frustrated with the old way", "Shot: medium · Move: handheld · Audio: VO + trending sound low"],
        ["Frame 3 · Reveal (7–12s)\nProduct on the table, soft light", "Shot: top-down · Move: slow slide · Text: product name"],
        ["Frame 4 · Demo (12–20s)\nUsing the product, 3 quick cuts", "Shot: close-ups · Move: static, cut on beat · Audio: VO steps 1-2-3"],
        ["Frame 5 · Result (20–25s)\nHappy face, before / after split", "Shot: medium · Move: slow-mo · Text: the result in 3 words"],
        ["Frame 6 · CTA (25–30s)\nLogo + offer on screen", "Shot: product hero · Text: “Order now — link in bio” · End card"],
      ];
      const nodes: WbNode[] = [title(0, -100, "Storyboard — reel: ______ (brand / date)", 1000)];
      const edges: WbEdge[] = [];
      let prev: WbNode | null = null;
      frames.forEach(([shot, notes], i) => {
        const x = (i % 3) * 360;
        const y = 60 + Math.floor(i / 3) * 440;
        const f = box(x, y, shot, i === 0 ? ROSE : BLUE, 320, 180);
        nodes.push(f, sticky(x, y + 200, notes, YELLOW, 320, 140));
        if (prev) edges.push(edge(prev, f));
        prev = f;
      });
      const info = zone(1100, 60, zoneW(1) + 40, zoneH(4) + 10, "🎬 Shoot info", SLATE);
      nodes.push(info, ...fill(info, ["Location: studio / client shop — address", "Crew: director, camera, light, talent", "Equipment: camera, 2 lights, gimbal, mic", "Props: product ×3, table, plants"], GREY, 1).map((s) => ({ ...s, x: info.x + 40 })));
      return board(nodes, edges);
    },
  },
  {
    key: "weekly-content-board",
    kind: "whiteboard",
    category: "Creative",
    name: "Weekly content calendar",
    icon: "🗓️",
    description: "Saturday to Friday columns with the week's reels, posts, carousels and stories.",
    build: () => {
      const W = zoneW(1);
      const H = zoneH(3) + 10;
      const days: [string, [string, string][]][] = [
        ["Saturday", [["🎬 Reel · Vanilla Roza\n“3 ways to…” · 8 PM", PINK], ["📱 Story · poll", YELLOW]]],
        ["Sunday", [["🖼️ Static · Blissify\nTip of the week · 6 PM", SKY]]],
        ["Monday", [["🎠 Carousel · OG Hub\nStep-by-step guide · 7 PM", LILAC], ["📱 Story · behind the scenes", YELLOW]]],
        ["Tuesday", [["🎬 Reel · NEXORA\nTeam day-in-the-life · 9 PM", PINK]]],
        ["Wednesday", [["🖼️ Static · Vanilla Roza\nCustomer review · 6 PM", SKY], ["🎠 Carousel · Blissify Academy\nCourse outline · 8 PM", LILAC]]],
        ["Thursday", [["🎬 Reel · Blissify\nTrend audio · 9 PM", PINK], ["📱 Story · Q&A", YELLOW], ["🖼️ Static · OG Hub\nWeekend offer", SKY]]],
        ["Friday", [["📱 Story · weekly recap", YELLOW]]],
      ];
      const nodes: WbNode[] = [title(0, -110, "Weekly content calendar — week of __ / __"), label(0, -60, "The week starts on Saturday. One sticky per post: type · brand · idea · time.", 1000, 40, 15)];
      days.forEach(([name, posts], i) => {
        const z = zone(i * (W + 20), 0, W, H, name, i === 6 ? SLATE : BLUE);
        nodes.push(z, ...posts.map(([t, c], j) => sticky(z.x + 20, ZONE_HEAD + j * STEP_Y, t, c)));
      });
      nodes.push(label(0, H + 30, "Pink = reel · Blue = static · Purple = carousel · Yellow = story", 900, 40, 16));
      return board(nodes);
    },
  },
];

/* ------------------------------------------------------------------ */
/* Docs                                                                 */
/* ------------------------------------------------------------------ */

const DOCS: PageTemplate[] = [
  {
    key: "meeting-notes",
    kind: "doc",
    category: "Project management",
    name: "Meeting notes",
    icon: "📝",
    description: "Agenda, notes, decisions and action items with owners.",
    build: () =>
      doc(
        h1("Meeting: [topic]"),
        p("Date: dd/mm/yyyy · Time: __:__ · Where: office / online"),
        p("Attendees: @name, @name, @name"),
        callout("🎯", "Goal of this meeting in one sentence."),
        h2("Agenda"),
        nums(["Last week's follow-ups (5 min)", "Main topic (20 min)", "Next steps (5 min)"]),
        h2("Notes"),
        bullets(["Key point…", "Key point…"]),
        h2("Decisions"),
        bullets(["We decided to…"]),
        h2("Action items"),
        todos(["[Task] — owner: @name — due: dd/mm", "[Task] — owner: @name — due: dd/mm"]),
        divider(),
        p("Next meeting: dd/mm/yyyy"),
      ),
  },
  {
    key: "project-brief",
    kind: "doc",
    category: "Professional services",
    name: "Project brief",
    icon: "📋",
    description: "What the project is, why, scope, timeline, budget and who decides.",
    build: () =>
      doc(
        h1("Project brief: [project name]"),
        p("Client: ____ · Account manager: @name · Date: dd/mm/yyyy"),
        h2("Background"),
        p("What is happening and why the client needs this now."),
        h2("Objectives"),
        bullets(["Objective 1 (measurable)", "Objective 2"]),
        h2("Scope"),
        h3("In scope"),
        bullets(["e.g. 1 hero reel, 6 statics, 1 shoot day"]),
        h3("Out of scope"),
        bullets(["e.g. paid ads management, printing"]),
        h2("Timeline"),
        bullets(["Kick-off: dd/mm", "First draft: dd/mm", "Final delivery: dd/mm"]),
        h2("Budget"),
        p("Total: ____ EGP · Payment terms: 50% upfront, 50% on delivery"),
        h2("Team & approvals"),
        bullets(["Project owner: @name", "Creative: @name", "Client approver: name, role"]),
        h2("Risks"),
        bullets(["What could go wrong and what we'll do about it"]),
        callout("✅", "Sign-off: the client confirms this brief before work starts."),
      ),
  },
  {
    key: "creative-brief",
    kind: "doc",
    category: "Creative",
    name: "Creative brief",
    icon: "🎨",
    description: "Agency-style brief: objective, audience, key message, deliverables, tone, references, deadline.",
    build: () =>
      doc(
        h1("Creative brief: [brand] — [campaign]"),
        p("Brand: ____ · Owner: @name · Date: dd/mm/yyyy · Deadline: dd/mm/yyyy"),
        callout("💡", "If the team reads only one line, it's this: [the big idea in one sentence]."),
        h2("Objective"),
        p("What should this content achieve? e.g. drive 200 DMs for the new menu in 2 weeks."),
        h2("Audience"),
        bullets(["Who: age, city, lifestyle", "What they care about", "What they think about the brand today"]),
        h2("Key message"),
        quote("The one thing we want them to remember."),
        h3("Reasons to believe"),
        bullets(["Proof point 1", "Proof point 2"]),
        h2("Deliverables"),
        todos(["Reel × __ (9:16, 15–30s)", "Static post × __ (4:5)", "Carousel × __ (up to 10 slides)", "Story × __ (9:16)"]),
        h2("Tone & look"),
        bullets(["Tone: e.g. warm, witty, confident", "Colours / fonts: follow the brand guidelines", "Must include: logo, CTA, …", "Avoid: …"]),
        h2("References"),
        bullets(["Link to a reference reel", "Link to the mood board"]),
        h2("Timeline"),
        bullets(["Concepts: dd/mm", "Shoot: dd/mm", "First drafts: dd/mm", "Final approval: dd/mm", "Go live: dd/mm"]),
        h2("Approvals"),
        p("Internal: @name · Client: name"),
      ),
  },
  {
    key: "reel-script",
    kind: "doc",
    category: "Creative",
    name: "Reel script",
    icon: "🎬",
    description: "Hook, scenes, voice-over, on-screen captions and the call to action.",
    build: () =>
      doc(
        h1("Reel script: [title]"),
        p("Brand: ____ · Length: 15 / 30 / 60s · Format: 9:16 · Writer: @name"),
        callout("🪝", "Hook (first 2 seconds): the line or shot that stops the scroll."),
        h2("Idea"),
        p("One sentence: what happens in this reel and why people will watch to the end."),
        h2("Scenes"),
        h3("Scene 1 — Hook (0–3s)"),
        bullets(["Shot: …", "Voice-over: “…”", "On-screen text: …"]),
        h3("Scene 2 — Build-up (3–10s)"),
        bullets(["Shot: …", "Voice-over: “…”", "On-screen text: …"]),
        h3("Scene 3 — Payoff (10–20s)"),
        bullets(["Shot: …", "Voice-over: “…”", "On-screen text: …"]),
        h3("Scene 4 — CTA (20–30s)"),
        bullets(["Shot: product / logo", "Voice-over: “…”", "On-screen text: e.g. Order now — link in bio"]),
        h2("Caption"),
        p("Post caption with 3–5 hashtags."),
        h2("Music / sound"),
        p("Trending audio link or mood."),
        h2("Checklist"),
        todos(["Hook in the first 2 seconds", "Captions readable on mute", "Logo and CTA at the end", "Client approved the script"]),
      ),
  },
  {
    key: "content-calendar-brief",
    kind: "doc",
    category: "Marketing",
    name: "Content calendar brief",
    icon: "🗓️",
    description: "The month's plan for one brand: goals, pillars, key dates and the post mix.",
    build: () =>
      doc(
        h1("Content plan: [brand] — [month]"),
        p("Owner: @name · Approved by: ____ · Due: dd/mm/yyyy"),
        h2("This month's goals"),
        bullets(["e.g. grow reach 15%", "e.g. launch the new product"]),
        h2("Key dates"),
        bullets(["dd/mm — occasion / launch / holiday", "dd/mm — …"]),
        h2("Content pillars & mix"),
        bullets(["Educate — 30%", "Inspire — 25%", "Behind the scenes — 20%", "Community — 15%", "Promote — 10%"]),
        h2("Post count"),
        bullets(["Reels: __", "Statics: __", "Carousels: __", "Stories: __ per week"]),
        h2("Shoot needs"),
        bullets(["Shoot day: dd/mm", "Location, talent, props"]),
        h2("Links"),
        bullets(["Canva / design board", "Drive folder for the month"]),
        callout("📌", "Add each post to the brand's month plan in the app so it flows through the steps."),
      ),
  },
  {
    key: "sop",
    kind: "doc",
    category: "Operations",
    name: "SOP (standard operating procedure)",
    icon: "📘",
    description: "A repeatable process written step by step, with roles and checks.",
    build: () =>
      doc(
        h1("SOP: [process name]"),
        p("Owner: @name · Version 1.0 · Last updated: dd/mm/yyyy"),
        h2("Purpose"),
        p("Why this process exists and what “done well” looks like."),
        h2("Scope"),
        p("When to use it, and when not to."),
        h2("Roles"),
        bullets(["Responsible: who does it", "Approver: who checks it", "Informed: who needs to know"]),
        h2("What you need before you start"),
        bullets(["Access to …", "Files / templates: …"]),
        h2("Steps"),
        nums(["Step one — what to do, and where", "Step two", "Step three", "Step four — hand off to …"]),
        h2("Quality checks"),
        todos(["Check 1", "Check 2"]),
        h2("If something goes wrong"),
        bullets(["Problem → what to do → who to tell"]),
        callout("🔄", "Review this SOP every 6 months or when the process changes."),
      ),
  },
  {
    key: "client-onboarding",
    kind: "doc",
    category: "Professional services",
    name: "Client onboarding checklist",
    icon: "🤝",
    description: "Everything to collect and set up when a new client signs.",
    build: () =>
      doc(
        h1("Client onboarding: [client]"),
        p("Account manager: @name · Start date: dd/mm/yyyy"),
        h2("Contract & money"),
        todos(["Contract signed", "First invoice sent", "Payment received", "Scope and number of posts agreed"]),
        h2("Access"),
        todos(["Instagram / Facebook (Meta Business) access", "TikTok access", "Ads account access", "Website / analytics access"]),
        h2("Brand assets"),
        todos(["Logo files (PNG + vector)", "Fonts and colours", "Brand guidelines", "Product photos", "Past content that worked"]),
        h2("Kick-off meeting"),
        todos(["Goals for the first 3 months", "Audience and competitors", "Approval process and contact person", "Posting times and frequency"]),
        h2("Set up in NEXORA Ops"),
        todos(["Brand added with logo and colour", "Default people per step chosen", "First month plan created", "Drive folder shared"]),
        callout("📅", "First content goes live within 10 working days of the kick-off."),
      ),
  },
  {
    key: "weekly-report",
    kind: "doc",
    category: "Project management",
    name: "Weekly report",
    icon: "📅",
    description: "Wins, progress, blockers and next week's plan in one page.",
    build: () =>
      doc(
        h1("Weekly report — week of dd/mm"),
        p("Team / person: ____"),
        h2("🏆 Wins"),
        bullets(["…"]),
        h2("📦 Delivered"),
        bullets(["Brand — what was delivered"]),
        h2("🚧 In progress"),
        bullets(["Item — status — expected date"]),
        h2("⛔ Blockers"),
        bullets(["What's stuck and what help is needed"]),
        h2("📈 Numbers"),
        bullets(["Posts published: __", "Late steps: __", "Change requests: __"]),
        h2("Next week"),
        todos(["Priority 1", "Priority 2", "Priority 3"]),
      ),
  },
  {
    key: "monthly-client-report",
    kind: "doc",
    category: "Professional services",
    name: "Monthly client report",
    icon: "📈",
    description: "What we delivered, the results, what we learned and next month's plan.",
    build: () =>
      doc(
        h1("[Brand] — monthly report, [month]"),
        p("Prepared by: @name · Sent on: dd/mm/yyyy"),
        callout("⭐", "Headline: the one result we're proudest of this month."),
        h2("Delivered"),
        bullets(["Reels: __ of __ planned", "Statics: __", "Carousels: __", "Stories: __"]),
        h2("Results"),
        bullets(["Reach: __ (vs last month __%)", "Engagement rate: __%", "Followers: +__", "Website clicks / DMs / orders: __"]),
        h2("Top 3 posts"),
        nums(["Post — why it worked", "Post — why it worked", "Post — why it worked"]),
        h2("What we learned"),
        bullets(["Insight → what we'll do with it"]),
        h2("Next month"),
        bullets(["Focus", "Key dates", "Shoot day"]),
        h2("What we need from you"),
        todos(["Approve next month's plan by dd/mm", "Send new product photos"]),
      ),
  },
  {
    key: "campaign-post-mortem",
    kind: "doc",
    category: "Marketing",
    name: "Campaign post-mortem",
    icon: "🔍",
    description: "What the campaign aimed for, what happened, and the lessons to keep.",
    build: () =>
      doc(
        h1("Post-mortem: [campaign]"),
        p("Dates: dd/mm – dd/mm · Brand: ____ · Written by: @name"),
        h2("Goal vs result"),
        bullets(["Goal: …", "Result: …", "Hit / missed by: __%"]),
        h2("Budget"),
        bullets(["Planned: __ EGP", "Spent: __ EGP", "Cost per result: __ EGP"]),
        h2("What went well"),
        bullets(["…"]),
        h2("What didn't"),
        bullets(["…"]),
        h2("Why (root causes)"),
        bullets(["…"]),
        h2("Lessons for next time"),
        todos(["Keep doing: …", "Stop doing: …", "Start doing: …"]),
        callout("🙏", "Blameless: we look at the process, not at people."),
      ),
  },
  {
    key: "job-description",
    kind: "doc",
    category: "HR",
    name: "Job description",
    icon: "💼",
    description: "Role summary, responsibilities, requirements and what we offer.",
    build: () =>
      doc(
        h1("[Job title]"),
        p("Team: ____ · Reports to: ____ · Location: Cairo (on-site / hybrid) · Type: full-time"),
        h2("About us"),
        p("NEXORA is a creative and social-media agency in Cairo. We plan, shoot, edit and publish content for brands."),
        h2("The role"),
        p("Two or three sentences on why this role exists and what success looks like after 6 months."),
        h2("What you'll do"),
        bullets(["Responsibility 1", "Responsibility 2", "Responsibility 3"]),
        h2("What you'll bring"),
        bullets(["Must have: …", "Must have: …", "Nice to have: …"]),
        h2("What we offer"),
        bullets(["Salary range: ____", "Growth and training", "A friendly, creative team"]),
        h2("How to apply"),
        p("Send your CV and portfolio to ____ with the job title in the subject."),
      ),
  },
  {
    key: "interview-scorecard",
    kind: "doc",
    category: "HR",
    name: "Interview scorecard",
    icon: "🧾",
    description: "Score a candidate the same way every time, with evidence.",
    build: () =>
      doc(
        h1("Interview scorecard: [candidate] — [role]"),
        p("Interviewer: @name · Date: dd/mm/yyyy · Stage: screening / task / final"),
        callout("⚖️", "Score each area 1–5 and write the evidence. Decide before you talk to other interviewers."),
        h2("Skills"),
        bullets(["Craft (portfolio / task): _/5 — evidence…", "Tools (Premiere, After Effects, Canva…): _/5 — evidence…"]),
        h2("Ways of working"),
        bullets(["Communication: _/5 — evidence…", "Speed and organisation: _/5 — evidence…", "Takes feedback well: _/5 — evidence…"]),
        h2("Culture add"),
        bullets(["_/5 — what they'd bring to the team"]),
        h2("Questions asked"),
        nums(["Tell me about a project you're proud of.", "Tell me about feedback you disagreed with.", "How do you handle three deadlines on the same day?"]),
        h2("Red flags"),
        bullets(["…"]),
        h2("Recommendation"),
        todos(["Strong yes", "Yes", "No", "Strong no"]),
      ),
  },
  {
    key: "new-hire-onboarding",
    kind: "doc",
    category: "HR",
    name: "New hire onboarding",
    icon: "👋",
    description: "A first-week plan so a new teammate feels welcome and productive.",
    build: () =>
      doc(
        h1("Welcome, [name]! 🎉"),
        p("Role: ____ · Buddy: @name · Manager: @name · Start date: dd/mm/yyyy"),
        h2("Before day 1"),
        todos(["Contract signed", "Account created in NEXORA Ops", "Laptop and software ready", "Added to the team chat"]),
        h2("Day 1"),
        todos(["Welcome coffee with the team", "Tour of the office and studio", "Set your own password and profile photo", "Read the AGENTS / SOP docs for your team"]),
        h2("Day 2–3"),
        todos(["Shadow your buddy on real work", "Meet each team lead (15 min each)", "Learn the content workflow: content → shoot → edit → social"]),
        h2("Day 4–5"),
        todos(["Do your first small task end to end", "Ask all your questions in a 1:1", "Share first-week feedback"]),
        h2("First 30 days"),
        bullets(["Goal 1", "Goal 2"]),
        callout("💬", "No question is silly. Ask in the team chat or your buddy anytime."),
      ),
  },
  {
    key: "prd",
    kind: "doc",
    category: "IT & Engineering",
    name: "Product requirements (PRD)",
    icon: "🧩",
    description: "Problem, users, requirements, scope and how we'll know it worked.",
    build: () =>
      doc(
        h1("PRD: [feature name]"),
        p("Owner: @name · Status: draft / review / approved · Last updated: dd/mm/yyyy"),
        h2("Problem"),
        p("What problem are we solving, for whom, and how do we know it's real?"),
        h2("Goals & success metrics"),
        bullets(["Goal → metric → target"]),
        h2("Non-goals"),
        bullets(["What this will NOT do"]),
        h2("Users & stories"),
        bullets(["As a [role], I want [action] so that [benefit]."]),
        h2("Requirements"),
        h3("Must have"),
        todos(["…"]),
        h3("Nice to have"),
        todos(["…"]),
        h2("Design"),
        p("Link to designs / sketches."),
        h2("Permissions & security"),
        bullets(["Who can see / do what", "Data stored and for how long"]),
        h2("Open questions"),
        bullets(["…"]),
        h2("Launch plan"),
        bullets(["Testing", "Rollout", "Announcement"]),
      ),
  },
  {
    key: "incident-report",
    kind: "doc",
    category: "IT & Engineering",
    name: "Incident report",
    icon: "🚨",
    description: "What broke, the impact, the timeline, the root cause and the fixes.",
    build: () =>
      doc(
        h1("Incident: [short title]"),
        p("Severity: low / medium / high · Reported by: @name · Date: dd/mm/yyyy"),
        h2("Summary"),
        p("What happened, in two sentences."),
        h2("Impact"),
        bullets(["Who was affected", "For how long", "Data lost? yes / no"]),
        h2("Timeline"),
        bullets(["__:__ — first sign", "__:__ — noticed by …", "__:__ — fixed"]),
        h2("Root cause"),
        p("Why it happened (ask “why?” five times)."),
        h2("Fix"),
        bullets(["What we did right away"]),
        h2("Follow-ups"),
        todos(["Prevent it: … — owner @name", "Detect it sooner: … — owner @name"]),
        callout("🙏", "Blameless: we fix systems, not people."),
      ),
  },
  {
    key: "shoot-call-sheet",
    kind: "doc",
    category: "Creative",
    name: "Shoot call sheet",
    icon: "📸",
    description: "Date, location, crew, schedule, equipment and contacts for a shoot day.",
    build: () =>
      doc(
        h1("Call sheet: [brand] shoot"),
        callout("📍", "Date: dd/mm/yyyy · Call time: __:__ · Location: address + map link"),
        h2("Crew"),
        bullets(["Director: name — phone", "Camera: name — phone", "Lighting: name — phone", "Talent: name — phone", "Client contact: name — phone"]),
        h2("Schedule"),
        bullets(["09:00 — crew call, set up", "10:00 — scene 1", "12:00 — scene 2", "13:30 — lunch", "14:30 — scene 3", "17:00 — wrap, pack up"]),
        h2("Shot list"),
        nums(["Hook shot — close-up of …", "Product hero shot", "Talent scene", "B-roll: details, hands, environment"]),
        h2("Equipment"),
        todos(["Camera + 2 batteries + cards", "Lenses: 24–70, 50mm", "Lights + stands", "Gimbal", "Mic", "Extension cables"]),
        h2("Props & wardrobe"),
        todos(["Product × 3", "Props: …", "Wardrobe: …"]),
        h2("Notes"),
        bullets(["Parking, permissions, weather backup"]),
      ),
  },
  {
    key: "brand-guidelines",
    kind: "doc",
    category: "Creative",
    name: "Brand guidelines summary",
    icon: "🎨",
    description: "Logo, colours, fonts, tone of voice and do's and don'ts on one page.",
    build: () =>
      doc(
        h1("[Brand] — brand guidelines"),
        p("Last updated: dd/mm/yyyy · Full guidelines: link"),
        h2("Who we are"),
        p("The brand in one sentence. Mission, personality in 3 words."),
        h2("Logo"),
        bullets(["Main logo: link", "Minimum size and clear space", "Never stretch, recolour or add effects"]),
        h2("Colours"),
        bullets(["Primary: #______", "Secondary: #______", "Background: #______"]),
        h2("Fonts"),
        bullets(["Headlines: ____", "Body: ____", "Arabic: ____"]),
        h2("Tone of voice"),
        bullets(["We are: …", "We are not: …", "Language: English / Egyptian Arabic / mix"]),
        h2("Visual style"),
        bullets(["Photography: light, natural, real people", "Video: fast cuts, captions always on"]),
        h2("Do's and don'ts"),
        bullets(["✅ Do: …", "❌ Don't: …"]),
      ),
  },
  {
    key: "one-on-one",
    kind: "doc",
    category: "HR",
    name: "1:1 meeting notes",
    icon: "☕",
    description: "A running page for regular one-to-ones: wins, challenges, growth and actions.",
    build: () =>
      doc(
        h1("1:1 — [manager] & [team member]"),
        p("Every two weeks · 30 min · Newest meeting on top"),
        divider(),
        h2("dd/mm/yyyy"),
        h3("How are you doing?"),
        p("Energy, workload, anything on your mind."),
        h3("Wins since last time"),
        bullets(["…"]),
        h3("Challenges"),
        bullets(["…"]),
        h3("Growth"),
        bullets(["Skill you're working on", "Feedback (both ways)"]),
        h3("Actions"),
        todos(["… — @name", "… — @name"]),
      ),
  },
  {
    key: "decision-log",
    kind: "doc",
    category: "Strategy",
    name: "Decision log",
    icon: "⚖️",
    description: "Record important decisions: the context, the options and why we chose.",
    build: () =>
      doc(
        h1("Decision log"),
        callout("📌", "One entry per decision, newest on top. Never delete — add a new entry if a decision changes."),
        divider(),
        h2("[Decision title] — dd/mm/yyyy"),
        p("Decided by: @name · Status: decided / revisit on dd/mm"),
        h3("Context"),
        p("What's going on and why we need to decide."),
        h3("Options"),
        nums(["Option A — pros / cons", "Option B — pros / cons", "Option C — pros / cons"]),
        h3("Decision"),
        p("We chose … because …"),
        h3("Consequences"),
        bullets(["What changes now", "Who needs to know"]),
      ),
  },
  {
    key: "sales-proposal",
    kind: "doc",
    category: "Sales & CRM",
    name: "Sales proposal",
    icon: "📑",
    description: "A client proposal: their challenge, our approach, packages, price and next steps.",
    build: () =>
      doc(
        h1("Proposal for [client]"),
        p("Prepared by: @name · Date: dd/mm/yyyy · Valid until: dd/mm/yyyy"),
        h2("Your challenge"),
        p("What we heard from you, in your words."),
        h2("Our approach"),
        bullets(["Strategy: content pillars and monthly plan", "Production: shooting, editing, design", "Publishing and community", "Monthly report"]),
        h2("Packages"),
        h3("Starter"),
        bullets(["4 reels + 8 statics / month", "____ EGP / month"]),
        h3("Growth"),
        bullets(["8 reels + 12 statics + stories / month", "____ EGP / month"]),
        h2("Why NEXORA"),
        bullets(["In-house studio and editors", "Clear process and on-time delivery", "Results we can show"]),
        h2("Timeline"),
        bullets(["Week 1: onboarding and plan", "Week 2: shoot", "Week 3: first posts live"]),
        h2("Next steps"),
        todos(["Approve the package", "Sign the contract", "Kick-off meeting"]),
      ),
  },
  {
    key: "sales-call-notes",
    kind: "doc",
    category: "Sales & CRM",
    name: "Sales call notes",
    icon: "📞",
    description: "Discovery call notes: needs, budget, decision maker, timeline and follow-up.",
    build: () =>
      doc(
        h1("Call: [company] — dd/mm/yyyy"),
        p("With: name, role · Phone / email: ____ · Source: Instagram / referral / event"),
        h2("About them"),
        bullets(["What they sell", "Who their customers are", "Current social media: who does it today"]),
        h2("Needs & pains"),
        bullets(["…"]),
        h2("Budget"),
        p("Range: ____ EGP / month"),
        h2("Decision"),
        bullets(["Decision maker: …", "Timeline: …", "Other agencies they're talking to: …"]),
        h2("Next steps"),
        todos(["Send proposal by dd/mm", "Follow-up call on dd/mm"]),
      ),
  },
  {
    key: "support-replies",
    kind: "doc",
    category: "Support",
    name: "Support reply templates",
    icon: "💬",
    description: "Ready replies for common client and customer messages, in a consistent tone.",
    build: () =>
      doc(
        h1("Reply templates"),
        callout("🗣️", "Personalise every reply: use their name and mention their exact issue. Reply within 2 working hours."),
        h2("We got your message"),
        quote("Hi [name], thanks for reaching out! We've received your request about [topic] and [person] is on it. You'll hear from us by [time]."),
        h2("Need more information"),
        quote("Hi [name], to help you faster, could you send [screenshot / order number / link]? Thank you!"),
        h2("Change request received"),
        quote("Hi [name], noted! We'll update [post] with your changes and send the new version by [day]."),
        h2("Delay"),
        quote("Hi [name], quick update: [item] needs a little more time because [reason]. New date: [date]. Sorry for the wait."),
        h2("Solved"),
        quote("Hi [name], all done ✅ [what we did]. Let us know if anything else needs a tweak."),
        h2("Complaint"),
        quote("Hi [name], we're sorry about this. You're right that [issue]. Here's what we'll do: [fix] by [date]."),
      ),
  },
  {
    key: "personal-weekly-plan",
    kind: "doc",
    category: "Personal",
    name: "Personal weekly plan",
    icon: "🌱",
    description: "Your top priorities, a day-by-day plan and a short reflection at the end of the week.",
    build: () =>
      doc(
        h1("My week — dd/mm to dd/mm"),
        callout("🎯", "If I only get three things done this week, they are…"),
        h2("Top 3"),
        todos(["…", "…", "…"]),
        h2("Day by day"),
        h3("Saturday"),
        todos(["…"]),
        h3("Sunday"),
        todos(["…"]),
        h3("Monday"),
        todos(["…"]),
        h3("Tuesday"),
        todos(["…"]),
        h3("Wednesday"),
        todos(["…"]),
        h3("Thursday"),
        todos(["…"]),
        h2("Learning & health"),
        todos(["Learn: …", "Move: …", "Rest: …"]),
        h2("Friday reflection"),
        bullets(["What went well", "What I'll change next week"]),
      ),
  },
];

/* ------------------------------------------------------------------ */
/* Sheets                                                               */
/* ------------------------------------------------------------------ */

const SHEETS: PageTemplate[] = [
  {
    key: "budget-tracker",
    kind: "sheet",
    category: "Finance",
    name: "Budget tracker",
    icon: "💰",
    description: "Planned vs actual per item, the difference, and totals.",
    build: () =>
      sheet(
        [["Category", "text", 150], ["Item", "text", 220], ["Planned (EGP)", "money"], ["Actual (EGP)", "money"], ["Difference", "money"], ["Paid", "check", 90], ["Notes", "text", 220]],
        [
          ["Production", "Studio rent — shoot day", "6000", "6500", "=C{r}-D{r}", "true", "Extra hour"],
          ["Production", "Equipment rental", "4000", "3500", "=C{r}-D{r}", "true"],
          ["Talent", "Model / actor", "5000", "5000", "=C{r}-D{r}", ""],
          ["Ads", "Instagram ads", "15000", "12000", "=C{r}-D{r}", "", "Still running"],
          ["Ads", "TikTok ads", "8000", "", "=C{r}-D{r}"],
          ["Other", "Props", "1500", "1800", "=C{r}-D{r}", "true"],
          ...blanks(4),
          ["Total", "", "=SUM(C1:C10)", "=SUM(D1:D10)", "=SUM(E1:E10)"],
        ],
      ),
  },
  {
    key: "content-calendar-sheet",
    kind: "sheet",
    category: "Marketing",
    name: "Content calendar",
    icon: "🗓️",
    description: "Every post of the month: date, brand, type, title, caption, status and link.",
    build: () =>
      sheet(
        [["Date", "date", 120], ["Brand", "text", 140], ["Type", "text", 100], ["Title", "text", 220], ["Caption", "text", 300], ["Platforms", "text", 160], ["Status", "text", 130], ["Owner", "text", 120], ["Link", "text", 200]],
        [
          ["2026-11-01", "Vanilla Roza", "Reel", "3 ways to style it", "Which one is your favourite? 👇", "Instagram, TikTok", "Scripted", "King"],
          ["2026-11-02", "Blissify", "Static", "Tip of the week", "Small habits, big change.", "Instagram", "Designing", "Gannah"],
          ["2026-11-03", "OG Hub", "Carousel", "Step-by-step guide", "Save this for later 📌", "Instagram, LinkedIn", "Idea", "Ammar"],
          ["2026-11-04", "NEXORA", "Story", "Behind the scenes", "", "Instagram", "Ready", "Esraa"],
          ["2026-11-05", "Blissify Academy", "Reel", "Course teaser", "Registration opens Sunday!", "Instagram, TikTok", "Editing", "Jana"],
          ...blanks(10),
        ],
      ),
  },
  {
    key: "kpi-tracker",
    kind: "sheet",
    category: "Marketing",
    name: "KPI tracker",
    icon: "📈",
    description: "Monthly reach, engagement and followers with engagement rate and growth formulas.",
    build: () =>
      sheet(
        [["Month", "text", 110], ["Followers", "number", 110], ["Reach", "number", 110], ["Engagements", "number", 120], ["Engagement rate %", "number", 150], ["Reach growth %", "number", 140], ["Posts", "number", 90], ["Notes", "text", 220]],
        [
          ["January", "12000", "85000", "4200", "=D{r}/C{r}*100", "", "20", "Baseline"],
          ["February", "12650", "97000", "5100", "=D{r}/C{r}*100", "=(C{r}-C{p})/C{p}*100", "22"],
          ["March", "13400", "120000", "6900", "=D{r}/C{r}*100", "=(C{r}-C{p})/C{p}*100", "24", "Ramadan campaign"],
          ["April", "", "", "", "", "", ""],
          ["May"],
          ["June"],
        ],
      ),
  },
  {
    key: "invoice-tracker",
    kind: "sheet",
    category: "Finance",
    name: "Invoice tracker",
    icon: "🧾",
    description: "Invoices with VAT, totals, due dates and what's been paid.",
    build: () =>
      sheet(
        [["Invoice #", "text", 110], ["Client", "text", 160], ["Issued", "date", 120], ["Due", "date", 120], ["Amount (EGP)", "money"], ["VAT 14%", "money", 120], ["Total", "money"], ["Paid", "check", 80], ["Paid on", "date", 120]],
        [
          ["INV-1001", "Vanilla Roza", "2026-10-01", "2026-10-15", "25000", "=E{r}*0.14", "=E{r}+F{r}", "true", "2026-10-12"],
          ["INV-1002", "Blissify", "2026-10-01", "2026-10-15", "30000", "=E{r}*0.14", "=E{r}+F{r}", "true", "2026-10-14"],
          ["INV-1003", "OG Hub", "2026-10-05", "2026-10-20", "18000", "=E{r}*0.14", "=E{r}+F{r}"],
          ["INV-1004", "SINAI (project)", "2026-10-08", "2026-10-22", "45000", "=E{r}*0.14", "=E{r}+F{r}"],
          ...blanks(6),
          ["Total", "", "", "", "=SUM(E1:E10)", "=SUM(F1:F10)", "=SUM(G1:G10)"],
        ],
      ),
  },
  {
    key: "expense-report",
    kind: "sheet",
    category: "Finance",
    name: "Expense report",
    icon: "🧮",
    description: "Out-of-pocket expenses with category, receipt and a total to reimburse.",
    build: () =>
      sheet(
        [["Date", "date", 120], ["Category", "text", 140], ["Description", "text", 240], ["Brand / project", "text", 150], ["Paid by", "text", 120], ["Amount (EGP)", "money"], ["Receipt", "check", 90], ["Notes", "text", 200]],
        [
          ["2026-10-03", "Transport", "Uber to the shoot location", "Vanilla Roza", "Ayman", "240", "true"],
          ["2026-10-03", "Props", "Flowers and table cloth", "Vanilla Roza", "Ayman", "650", "true"],
          ["2026-10-07", "Food", "Lunch for the crew", "Blissify", "Jana", "1200", "true"],
          ["2026-10-09", "Software", "Stock music licence", "NEXORA", "Kemo", "450", "", "Receipt by email"],
          ...blanks(6),
          ["Total", "", "", "", "", "=SUM(F1:F10)"],
        ],
      ),
  },
  {
    key: "lead-list",
    kind: "sheet",
    category: "Sales & CRM",
    name: "Lead list (CRM)",
    icon: "🎯",
    description: "Leads with contact details, source, stage, value and next follow-up.",
    build: () =>
      sheet(
        [["Company", "text", 160], ["Contact", "text", 140], ["Phone", "text", 130], ["Email", "text", 190], ["Source", "text", 120], ["Stage", "text", 130], ["Est. value / month (EGP)", "money", 170], ["Next follow-up", "date", 130], ["Notes", "text", 220]],
        [
          ["Café Nile", "Omar (owner)", "+20 100 000 0000", "omar@example.com", "Instagram DM", "Proposal sent", "20000", "2026-10-14", "Wants reels only"],
          ["Glow Clinic", "Dr. Salma", "+20 111 000 0000", "salma@example.com", "Referral", "Contacted", "35000", "2026-10-12"],
          ["FitBox Gym", "Karim", "+20 122 000 0000", "", "Event", "Lead", "15000", "2026-10-16"],
          ...blanks(9),
          ["Total pipeline", "", "", "", "", "", "=SUM(G1:G12)"],
        ],
      ),
  },
  {
    key: "equipment-inventory",
    kind: "sheet",
    category: "Operations",
    name: "Equipment inventory",
    icon: "🎥",
    description: "Cameras, lenses and lights with value, location, condition and who has them.",
    build: () =>
      sheet(
        [["Item", "text", 200], ["Category", "text", 120], ["Serial / tag", "text", 130], ["Qty", "number", 70], ["Unit value (EGP)", "money", 140], ["Total value", "money", 130], ["Location", "text", 120], ["Condition", "text", 110], ["Checked out to", "text", 140]],
        [
          ["Sony A7 IV", "Camera", "NX-CAM-01", "1", "120000", "=D{r}*E{r}", "Studio", "Good"],
          ["24–70mm f/2.8 lens", "Lens", "NX-LEN-01", "1", "85000", "=D{r}*E{r}", "Studio", "Good"],
          ["LED panel light", "Lighting", "NX-LGT-01/02", "2", "9000", "=D{r}*E{r}", "Studio", "Good"],
          ["DJI RS 3 gimbal", "Support", "NX-GMB-01", "1", "22000", "=D{r}*E{r}", "Out", "Good", "Ayman"],
          ["Wireless mic kit", "Audio", "NX-MIC-01", "2", "7500", "=D{r}*E{r}", "Studio", "Needs battery"],
          ...blanks(5),
          ["Total", "", "", "=SUM(D1:D10)", "", "=SUM(F1:F10)"],
        ],
      ),
  },
  {
    key: "timesheet",
    kind: "sheet",
    category: "HR",
    name: "Timesheet",
    icon: "⏱️",
    description: "Hours per task for each day of the week (Saturday to Friday) with totals.",
    build: () =>
      sheet(
        [["Task / brand", "text", 200], ["Sat", "number", 70], ["Sun", "number", 70], ["Mon", "number", 70], ["Tue", "number", 70], ["Wed", "number", 70], ["Thu", "number", 70], ["Fri", "number", 70], ["Total hours", "number", 110]],
        [
          ["Vanilla Roza — editing", "3", "2", "4", "", "2", "1", "", "=SUM(B{r}:H{r})"],
          ["Blissify — scripts", "2", "3", "", "2", "", "", "", "=SUM(B{r}:H{r})"],
          ["OG Hub — shoot", "", "", "3", "5", "", "", "", "=SUM(B{r}:H{r})"],
          ["Meetings", "1", "1", "1", "1", "1", "1", "", "=SUM(B{r}:H{r})"],
          ...blanks(4),
          ["Total", "=SUM(B1:B8)", "=SUM(C1:C8)", "=SUM(D1:D8)", "=SUM(E1:E8)", "=SUM(F1:F8)", "=SUM(G1:G8)", "=SUM(H1:H8)", "=SUM(I1:I8)"],
        ],
      ),
  },
  {
    key: "influencer-list",
    kind: "sheet",
    category: "Marketing",
    name: "Influencer list",
    icon: "🌟",
    description: "Creators with followers, views, engagement, rates and cost per 1,000 views.",
    build: () =>
      sheet(
        [["Name", "text", 150], ["Handle", "text", 140], ["Platform", "text", 110], ["Followers", "number", 110], ["Avg views", "number", 110], ["Engagement %", "number", 120], ["Niche", "text", 120], ["Rate per reel (EGP)", "money", 150], ["Cost per 1k views", "money", 140], ["Contact", "text", 160], ["Last worked", "date", 120]],
        [
          ["Creator A", "@creator.a", "Instagram", "85000", "40000", "4.2", "Beauty", "8000", "=H{r}/E{r}*1000", "DM / manager"],
          ["Creator B", "@creator.b", "TikTok", "230000", "120000", "6.8", "Lifestyle", "15000", "=H{r}/E{r}*1000", "email@example.com", "2026-09-10"],
          ["Creator C", "@creator.c", "Instagram", "32000", "18000", "7.5", "Food", "3500", "=H{r}/E{r}*1000", "+20 100 000 0000"],
          ...blanks(9),
        ],
      ),
  },
  {
    key: "media-buying-plan",
    kind: "sheet",
    category: "Marketing",
    name: "Media buying plan",
    icon: "📡",
    description: "Budget per platform and objective, with CPM and estimated impressions.",
    build: () =>
      sheet(
        [["Platform", "text", 130], ["Objective", "text", 140], ["Budget (EGP)", "money", 130], ["CPM (EGP)", "money", 110], ["Est. impressions", "number", 150], ["Start", "date", 120], ["End", "date", 120], ["Audience", "text", 220]],
        [
          ["Instagram", "Reach", "20000", "45", "=C{r}/D{r}*1000", "2026-11-01", "2026-11-30", "Women 22–35, Cairo"],
          ["Facebook", "Traffic", "8000", "30", "=C{r}/D{r}*1000", "2026-11-01", "2026-11-15", "Retargeting: website visitors"],
          ["TikTok", "Video views", "12000", "25", "=C{r}/D{r}*1000", "2026-11-05", "2026-11-30", "18–30, Egypt"],
          ["YouTube", "Awareness", "6000", "35", "=C{r}/D{r}*1000", "2026-11-10", "2026-11-30", "Interest: beauty"],
          ...blanks(4),
          ["Total", "", "=SUM(C1:C8)", "", "=SUM(E1:E8)"],
        ],
      ),
  },
  {
    key: "rate-card",
    kind: "sheet",
    category: "Sales & CRM",
    name: "Price list / rate card",
    icon: "🏷️",
    description: "Services, units and prices; set quantities to build a quick quote with VAT.",
    build: () =>
      sheet(
        [["Service", "text", 220], ["Unit", "text", 120], ["Price (EGP)", "money", 120], ["Qty", "number", 70], ["Line total", "money", 130], ["Notes", "text", 240]],
        [
          ["Reel (script + shoot + edit)", "per reel", "4500", "4", "=C{r}*D{r}", "Up to 30 seconds, 2 change rounds"],
          ["Static post design", "per post", "900", "8", "=C{r}*D{r}"],
          ["Carousel design", "per carousel", "1500", "2", "=C{r}*D{r}", "Up to 8 slides"],
          ["Story design", "per story", "350", "12", "=C{r}*D{r}"],
          ["Shoot day", "per day", "12000", "1", "=C{r}*D{r}", "Crew + basic equipment"],
          ["Community management", "per month", "6000", "1", "=C{r}*D{r}"],
          ["Monthly report", "per month", "1500", "1", "=C{r}*D{r}"],
          ...blanks(3),
          ["Subtotal", "", "", "", "=SUM(E1:E10)"],
          ["VAT 14%", "", "", "", "=E11*0.14"],
          ["Grand total", "", "", "", "=E11+E12"],
        ],
      ),
  },
  {
    key: "support-ticket-log",
    kind: "sheet",
    category: "Support",
    name: "Support ticket log",
    icon: "🎫",
    description: "Every client request: channel, priority, owner, status and time to resolve.",
    build: () =>
      sheet(
        [["Ticket #", "text", 100], ["Opened", "date", 120], ["Client", "text", 140], ["Channel", "text", 110], ["Issue", "text", 260], ["Priority", "text", 100], ["Owner", "text", 120], ["Status", "text", 120], ["Resolved", "date", 120], ["Hours to resolve", "number", 140]],
        [
          ["T-001", "2026-10-05", "Blissify", "WhatsApp", "Wrong price in yesterday's post", "Urgent", "Esraa", "Solved", "2026-10-05", "2"],
          ["T-002", "2026-10-06", "OG Hub", "Email", "Needs the raw files from the shoot", "Normal", "Jana", "Working on it"],
          ["T-003", "2026-10-07", "Vanilla Roza", "Call", "Change the reel music", "High", "Jana", "Waiting for client"],
          ...blanks(9),
          ["", "", "", "", "Total hours", "", "", "", "", "=SUM(J1:J12)"],
        ],
      ),
  },
  {
    key: "habit-tracker",
    kind: "sheet",
    category: "Personal",
    name: "Habit tracker",
    icon: "✅",
    description: "Tick each habit per day of the week and see how close you got to your goal.",
    build: () =>
      sheet(
        [["Habit", "text", 200], ["Sat", "check", 60], ["Sun", "check", 60], ["Mon", "check", 60], ["Tue", "check", 60], ["Wed", "check", 60], ["Thu", "check", 60], ["Fri", "check", 60], ["Goal (days)", "number", 110], ["Notes", "text", 200]],
        [
          ["Read 20 minutes", "true", "true", "", "true", "", "", "", "5"],
          ["Walk 8,000 steps", "true", "", "true", "", "", "", "", "4"],
          ["Learn something new (course / tutorial)", "", "true", "", "", "", "", "", "3"],
          ["Drink 2 L of water", "true", "true", "true", "", "", "", "", "7"],
          ["Sleep before midnight", "", "", "", "", "", "", "", "5"],
          ...blanks(3),
        ],
      ),
  },
];

export const PAGE_TEMPLATES: PageTemplate[] = [...WHITEBOARDS, ...DOCS, ...SHEETS];

export const pageTemplateByKey = (key: string | null | undefined) => PAGE_TEMPLATES.find((t) => t.key === key) ?? null;
