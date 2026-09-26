import { describe, expect, it } from "vitest";
import { parsePastedList } from "@/lib/paste";
import { routeFor, stageHealth, socialComplete, downstreamShift, guessTypeFromTitle } from "@/domain/workflow";
import { weekRange, startOfCairoDay, cairoDate } from "@/lib/dates";

describe("bulk paste parser", () => {
  it("reads rows copied from the old Excel sheet (title, Canva link, delivery date, posting date)", () => {
    const text = [
      "October\tPost 01: Coming Soon\thttps://canva.link/nl642e8uvkayeis\t9/22/2026\t\t10/1/2026",
      "\tOFF\tOFF\tOFF\tOFF\t10/3/2026",
      "The Ampoule\thttps://canva.link/fxgdr0zjw5uxt3m\t11/10/2026",
    ].join("\n");
    const rows = parsePastedList(text, 2026, 10);
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({ title: "The Ampoule", type: "reel", canvaUrl: "https://canva.link/fxgdr0zjw5uxt3m", postingDate: "2026-10-11" });
    expect(rows[0]).toMatchObject({ type: "static", postingDate: "2026-10-01" });
  });

  it("handles simple lists with explicit types, day-first dates and times", () => {
    const rows = parsePastedList("1. Hair Profile | Reel | 9 Oct | 7:30 pm\n- Carousel 03: Meet The Routine — Oct 19\nStory teaser  story", 2026, 10);
    expect(rows[0]).toMatchObject({ title: "Hair Profile", type: "reel", postingDate: "2026-10-09", postingTime: "19:30" });
    expect(rows[1]).toMatchObject({ type: "carousel", postingDate: "2026-10-19" });
    expect(rows[2]).toMatchObject({ title: "Story teaser", type: "story" });
  });
});

describe("workflow rules", () => {
  it("routes by type and context", () => {
    expect(routeFor("reel", "plan")).toEqual(["content", "media", "social"]);
    expect(routeFor("carousel", "plan")).toEqual(["content", "design", "social"]);
    expect(routeFor("story", "plan")).toEqual(["content", "social"]);
    expect(routeFor("reel", "project")).toEqual(["content", "media", "delivery"]);
  });
  it("never marks a stage late without a deadline or before it receives the work", () => {
    const base = { kind: "media" as const, position: 1, completedAt: null, returnedAt: null, round: 1, lateExcusedAt: null };
    expect(stageHealth({ ...base, status: "active", deadline: null }, "2026-10-20")).toBe("no_deadline");
    expect(stageHealth({ ...base, status: "waiting", deadline: "2026-10-01" }, "2026-10-20")).toBe("blocked");
    expect(stageHealth({ ...base, status: "active", deadline: "2026-10-01" }, "2026-10-20")).toBe("overdue");
    expect(stageHealth({ ...base, status: "active", deadline: "2026-10-01", lateExcusedAt: new Date() }, "2026-10-20")).toBe("overdue_excused");
  });
  it("doesn't count a stale deadline after work was returned", () => {
    const s = { kind: "content" as const, position: 0, status: "active" as const, deadline: "2026-10-05", completedAt: null, returnedAt: new Date("2026-10-09T10:00:00Z"), round: 2, lateExcusedAt: null };
    expect(stageHealth(s, "2026-10-12")).toBe("rework");
  });
  it("social completes only when every targeted platform is published", () => {
    expect(socialComplete([{ status: "published" }, { status: "not_planned" }, { status: "cancelled" }])).toBe(true);
    expect(socialComplete([{ status: "published" }, { status: "scheduled" }])).toBe(false);
    expect(socialComplete([{ status: "cancelled" }])).toBe(false);
  });
  it("applies delay increments only once", () => {
    expect(downstreamShift(3, 0)).toBe(3);
    expect(downstreamShift(3, 3)).toBe(0);
    expect(downstreamShift(6, 3)).toBe(3);
    expect(downstreamShift(1, 3)).toBe(0);
  });
  it("guesses types from Canva titles", () => {
    expect(guessTypeFromTitle("Post 02: Talk To Me")).toBe("static");
    expect(guessTypeFromTitle("Carousel 02: Healthier Hair Choices")).toBe("carousel");
    expect(guessTypeFromTitle("The Oil")).toBeNull();
  });
});

describe("Cairo dates", () => {
  it("uses Saturday-first weeks and DST-aware day starts", () => {
    expect(weekRange("2026-09-26")).toEqual({ start: "2026-09-26", end: "2026-10-02" });
    expect(weekRange("2026-10-02")).toEqual({ start: "2026-09-26", end: "2026-10-02" });
    expect(startOfCairoDay("2026-07-01").toISOString()).toBe("2026-06-30T21:00:00.000Z");
    expect(startOfCairoDay("2026-12-01").toISOString()).toBe("2026-11-30T22:00:00.000Z");
    expect(cairoDate(new Date("2026-09-30T22:30:00Z"))).toBe("2026-10-01");
  });
});
