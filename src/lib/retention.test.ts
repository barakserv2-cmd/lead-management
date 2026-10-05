import { describe, it, expect } from "vitest";
import { analyzeRetention, type RetentionLead } from "./retention";

const TODAY = "2026-09-28";

function worker(
  id: string,
  start: string | null,
  opts: Partial<Omit<RetentionLead, "id" | "start_date">> = {}
): RetentionLead {
  return {
    id,
    source: "AllJobs",
    status: "STARTED",
    employment_end_date: null,
    employment_end_reason: null,
    hired_client: "ישרוטל",
    ...opts,
    start_date: start,
  };
}

function left(id: string, start: string, end: string, reason: string | null = "burned_out", source = "AllJobs") {
  return worker(id, start, { status: "EMPLOYMENT_ENDED", employment_end_date: end, employment_end_reason: reason, source });
}

describe("analyzeRetention — who counts", () => {
  it("counts active workers and ignores leads that never reached a hire", () => {
    const r = analyzeRetention(
      [worker("a", "2026-09-01"), worker("b", "2026-08-01", { status: "HIRED" }), worker("x", "2026-09-01", { status: "CONTACTED" })],
      [],
      TODAY
    );
    expect(r.activeNow).toBe(2);
    expect(r.totals.started).toBe(2);
  });

  it("keeps future starts, never-started and undated records out of tenure", () => {
    const r = analyzeRetention(
      [
        worker("future", "2026-10-05", { status: "HIRED" }),
        left("ns", "2026-09-01", "2026-09-01", "never_started"),
        worker("ns2", "2026-09-01", { status: "NEVER_STARTED" }),
        worker("nodate", null),
        worker("noend", "2026-08-01", { status: "EMPLOYMENT_ENDED" }),
      ],
      [],
      TODAY
    );
    expect(r.upcoming).toBe(1);
    expect(r.neverStarted).toBe(2);
    expect(r.undated).toBe(2);
    expect(r.totals.started).toBe(0);
  });

  it("an internal transfer continues the spell instead of restarting it", () => {
    // עבר ממלון לרשת ב-1.9 — start_date נדרס, אבל הוא עובד אצלנו מאז 1.6
    const r = analyzeRetention(
      [worker("a", "2026-09-01")],
      [{ lead_id: "a", from_start_date: "2026-06-01" }],
      TODAY
    );
    expect(r.totals.survival[90]).toEqual({ eligible: 1, survived: 1, rate: 1 });
  });
});

describe("analyzeRetention — survival", () => {
  it("only judges day N for workers who started at least N days ago", () => {
    const r = analyzeRetention(
      [
        left("short", "2026-05-01", "2026-06-10"), // 40 ימים
        worker("long", "2026-05-01"), // פעיל, ~150 יום
        worker("new", "2026-09-20"), // 8 ימים — עוד לא רלוונטי ליום 30
      ],
      [],
      TODAY
    );
    expect(r.totals.survival[30]).toEqual({ eligible: 2, survived: 2, rate: 1 });
    expect(r.totals.survival[60]).toEqual({ eligible: 2, survived: 1, rate: 0.5 });
    expect(r.totals.survival[180].eligible).toBe(0);
    expect(r.totals.survival[180].rate).toBeNull();
  });

  it("reports worker-months and the median tenure of leavers per source", () => {
    const r = analyzeRetention(
      [
        left("a", "2026-05-01", "2026-05-31", "burned_out", "פייסבוק"), // 30
        left("b", "2026-05-01", "2026-07-30", "better_offer", "פייסבוק"), // 90
        left("c", "2026-05-01", "2026-06-30", "went_direct", "פייסבוק"), // 60
        worker("d", "2026-06-01", { source: "מכינות" }),
      ],
      [],
      TODAY
    );
    const fb = r.bySource.find((g) => g.key === "פייסבוק")!;
    expect(fb.started).toBe(3);
    expect(fb.left).toBe(3);
    expect(fb.medianDaysLeft).toBe(60);
    expect(fb.workerMonths).toBeCloseTo(180 / 30.44, 1);
    expect(r.bySource[0].key).toBe("פייסבוק"); // ממוין לפי כמות שהתחילו
  });

  it("leaves starts older than a year out of the cohort but counts them as active now", () => {
    const r = analyzeRetention([worker("veteran", "2025-01-01")], [], TODAY);
    expect(r.activeNow).toBe(1);
    expect(r.totals.started).toBe(0);
  });
});

describe("analyzeRetention — segment and friend", () => {
  it("groups by candidate segment and by whether the worker came with a friend", () => {
    const r = analyzeRetention(
      [
        worker("a", "2026-05-01", { candidate_segment: "boarding_pre_army", comes_with_friend: true }),
        worker("b", "2026-05-01", { candidate_segment: "boarding_pre_army", comes_with_friend: false }),
        left("c", "2026-05-01", "2026-06-01"),
      ],
      [],
      TODAY
    );
    expect(r.bySegment.find((g) => g.key === "בוגר פנימייה / לפני גיוס")?.started).toBe(2);
    expect(r.bySegment.find((g) => g.key === "לא סומן")?.left).toBe(1);
    expect(r.byFriend.map((g) => g.key).sort()).toEqual(["לבד", "עם חבר", "לא סומן"].sort());
  });
});

describe("analyzeRetention — reasons and monthly flow", () => {
  it("groups exits by reason, marks planned endings, and shows missing reasons", () => {
    const r = analyzeRetention(
      [
        left("a", "2026-05-01", "2026-06-01", "army_draft"),
        left("b", "2026-05-01", "2026-06-01", "burned_out"),
        left("c", "2026-05-01", "2026-06-01", "burned_out"),
        left("d", "2026-05-01", "2026-06-01", null),
      ],
      [],
      TODAY
    );
    expect(r.reasons[0]).toMatchObject({ code: "burned_out", count: 2, planned: false });
    expect(r.reasons.find((x) => x.code === "army_draft")).toMatchObject({ planned: true, count: 1 });
    expect(r.reasons.find((x) => x.code === null)).toMatchObject({ label: "לא צוין", count: 1 });
  });

  it("counts starts and exits per calendar month for the last six months", () => {
    const r = analyzeRetention(
      [worker("a", "2026-09-03"), left("b", "2026-07-10", "2026-09-15"), worker("c", "2026-02-01")],
      [],
      TODAY
    );
    expect(r.months.map((m) => m.month)).toEqual(["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"]);
    expect(r.months.at(-1)).toEqual({ month: "2026-09", started: 1, left: 1 });
    expect(r.months.find((m) => m.month === "2026-07")).toEqual({ month: "2026-07", started: 1, left: 0 });
  });
});
