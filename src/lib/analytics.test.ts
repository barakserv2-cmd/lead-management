import { describe, it, expect } from "vitest";
import { analyzeCohort, type CohortLead, type HistoryRow } from "./analytics";

const T0 = "2026-08-01T08:00:00Z";
const at = (days: number) => new Date(new Date(T0).getTime() + days * 86_400_000).toISOString();

function lead(id: string, status: string, source = "AllJobs"): CohortLead {
  return { id, source, created_at: T0, status };
}
function move(lead_id: string, to_status: string, days: number, by = "dana@x.co"): HistoryRow {
  return { lead_id, to_status, changed_by: by, changed_at: at(days) };
}

const count = (r: ReturnType<typeof analyzeCohort>, key: string) =>
  r.funnel.find((s) => s.key === key)!.count;

describe("analyzeCohort — funnel", () => {
  it("is cumulative: a lead that skipped stages counts in every earlier stage", () => {
    // NEW_LEAD → INTERVIEW_BOOKED directly, never CONTACTED/SCREENING/FIT
    const r = analyzeCohort([lead("a", "INTERVIEW_BOOKED")], [move("a", "INTERVIEW_BOOKED", 1)]);
    expect(count(r, "contacted")).toBe(1);
    expect(count(r, "screening")).toBe(1);
    expect(count(r, "fit")).toBe(1);
    expect(count(r, "interview")).toBe(1);
    expect(count(r, "arrived")).toBe(0);
  });

  it("never grows from one stage to the next", () => {
    const leads = [lead("a", "HIRED"), lead("b", "NO_SHOW"), lead("c", "CONTACTED"), lead("d", "NEW_LEAD")];
    const history = [
      move("a", "HIRED", 3),
      move("b", "INTERVIEW_BOOKED", 1),
      move("b", "NO_SHOW", 2),
      move("c", "CONTACTED", 1),
    ];
    const r = analyzeCohort(leads, history);
    const counts = r.funnel.map((s) => s.count);
    for (let i = 1; i < counts.length; i++) expect(counts[i]).toBeLessThanOrEqual(counts[i - 1]);
    expect(r.funnel[0].count).toBe(4);
    expect(count(r, "interview")).toBe(2); // a (hired ⇒ was interviewed) + b (no-show ⇒ was booked)
    expect(count(r, "arrived")).toBe(1);
    expect(count(r, "hired")).toBe(1);
  });

  it("treats a post-interview rejection as having arrived", () => {
    const r = analyzeCohort([lead("a", "NOT_ACCEPTED")], [move("a", "NOT_ACCEPTED", 2)]);
    expect(count(r, "arrived")).toBe(1);
    expect(count(r, "hired")).toBe(0);
  });

  it("uses the current status when the history is missing", () => {
    const r = analyzeCohort([lead("a", "STARTED")], []);
    expect(count(r, "hired")).toBe(1);
  });

  it("reports step conversion from the previous stage", () => {
    const leads = [lead("a", "INTERVIEW_BOOKED"), lead("b", "CONTACTED"), lead("c", "NEW_LEAD"), lead("d", "NEW_LEAD")];
    const r = analyzeCohort(leads, [move("a", "INTERVIEW_BOOKED", 1), move("b", "CONTACTED", 1)]);
    const contacted = r.funnel.find((s) => s.key === "contacted")!;
    expect(contacted.pct).toBe(50); // 2 of 4 entered
    expect(contacted.stepPct).toBe(50);
    expect(r.funnel[0].stepPct).toBeNull();
  });

  it("ignores history of leads outside the cohort", () => {
    const r = analyzeCohort([lead("a", "NEW_LEAD")], [move("zzz", "HIRED", 1)]);
    expect(count(r, "hired")).toBe(0);
    expect(r.recruiters).toHaveLength(0);
  });
});

describe("analyzeCohort — exits, open leads and timing", () => {
  it("groups closed leads by reason and marks those lost after an interview", () => {
    const leads = [lead("a", "NO_SHOW"), lead("b", "REJECTED"), lead("c", "REJECTED"), lead("d", "HIRED")];
    const history = [move("a", "INTERVIEW_BOOKED", 1), move("a", "NO_SHOW", 2), move("b", "REJECTED", 1), move("c", "REJECTED", 1)];
    const r = analyzeCohort(leads, history);
    expect(r.exits).toEqual([
      { status: "REJECTED", count: 2, afterInterview: 0 },
      { status: "NO_SHOW", count: 1, afterInterview: 1 },
    ]);
  });

  it("buckets open leads by where they stand now", () => {
    const leads = [lead("a", "NEW_LEAD"), lead("b", "SCREENING_IN_PROGRESS"), lead("c", "ARRIVED"), lead("d", "HIRED")];
    const r = analyzeCohort(leads, []);
    expect(Object.fromEntries(r.open.map((o) => [o.key, o.count]))).toEqual({ waiting: 1, working: 1, interview: 1 });
  });

  it("measures median days to interview and to hire from the first time each was reached", () => {
    const leads = [lead("a", "HIRED"), lead("b", "INTERVIEW_BOOKED"), lead("c", "INTERVIEW_BOOKED")];
    const history = [
      move("a", "CONTACTED", 0.5),
      move("a", "INTERVIEW_BOOKED", 2),
      move("a", "HIRED", 6),
      move("b", "INTERVIEW_BOOKED", 4),
      move("c", "INTERVIEW_BOOKED", 10),
      move("c", "POSTPONED_ARRIVAL", 11), // later interview event must not reset the first one
    ];
    const r = analyzeCohort(leads, history);
    expect(r.medianDaysToInterview).toBe(4);
    expect(r.medianDaysToHire).toBe(6);
    expect(r.medianFirstTouchHours).toBe(96); // a: 12h, b: 96h, c: 240h
  });

  it("counts interviews and hires per recruiter only for human actors", () => {
    const r = analyzeCohort(
      [lead("a", "HIRED")],
      [move("a", "INTERVIEW_BOOKED", 1, "dana@x.co"), move("a", "HIRED", 3, "dana@x.co"), move("a", "CONTACTED", 0.1, "bot")]
    );
    expect(r.recruiters).toEqual([{ email: "dana@x.co", actions: 2, interviews: 1, hires: 1 }]);
  });
});
