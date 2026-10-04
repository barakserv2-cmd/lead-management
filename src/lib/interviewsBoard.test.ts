import { describe, it, expect } from "vitest";
import { fetchInterviewRows, isHandledRow } from "./interviewsBoard";

type Row = Record<string, unknown>;

/**
 * Just enough of supabase for fetchInterviewRows: the leads query that filters
 * on interview_date gets the leads in a board status, the one that filters on
 * postponed_from_date gets every lead with an original date.
 */
function fakeDb(leads: Row[]) {
  return {
    from(table: string) {
      let byPostponed = false;
      let statuses: string[] | null = null;
      const data = () => {
        if (table === "user_profiles") return [{ email: "tami@eilatjobs.com", name: "תמי" }];
        if (table === "lead_events") return [];
        if (byPostponed) return leads.filter((l) => l.postponed_from_date);
        return leads.filter((l) => l.interview_date && (!statuses || statuses.includes(l.status as string)));
      };
      const q = {
        select: () => q,
        not: (col: string) => ((byPostponed ||= col === "postponed_from_date"), q),
        gte: () => q,
        lte: () => q,
        in: (col: string, vs: string[]) => ((statuses = col === "status" ? vs : statuses), q),
        order: () => q,
        limit: () => q,
        then: (res: (v: unknown) => void) => res({ data: data(), error: null }),
      };
      return q;
    },
  };
}

const win = { rangeStart: "2026-07-01T00:00:00Z", rangeEnd: "2026-12-01T00:00:00Z", isCustom: false };
const tahel = {
  id: "t1",
  name: "תהל",
  interview_type: "phone",
  interview_date: "2026-10-04T11:00:00+00:00",
  postponed_from_date: "2026-10-01T15:30:00+00:00",
  handled_by: "tami@eilatjobs.com",
};

describe("fetchInterviewRows — a postponed candidate's original date", () => {
  it("carries the lead's real status, so actions on it start from the truth", async () => {
    // תמי, 04.10: talked to her, moved her to "נוצר קשר · מעקב", then "בוצע"
    // on the original-date row failed with "מעבר לא חוקי: נוצר קשר ← הגיע לראיון"
    const db = fakeDb([{ ...tahel, status: "CONTACTED", sub_status: "מעקב" }]);
    const rows = await fetchInterviewRows(db as never, { ...win, typeMode: "phone" });
    expect(rows).toHaveLength(1); // the new-date row left the board with the interview stage
    expect(rows[0]).toMatchObject({ postponedOriginal: true, status: "POSTPONED_ARRIVAL", current_status: "CONTACTED" });
    expect(isHandledRow(rows[0])).toBe(true);
  });

  it("still waiting for the new date: both rows, both open", async () => {
    const db = fakeDb([{ ...tahel, status: "POSTPONED_ARRIVAL" }]);
    const rows = await fetchInterviewRows(db as never, { ...win, typeMode: "phone" });
    expect(rows.map((r) => [r.interview_date, r.current_status, !!r.postponedOriginal])).toEqual([
      ["2026-10-04T11:00:00+00:00", "POSTPONED_ARRIVAL", false],
      ["2026-10-01T15:30:00+00:00", "POSTPONED_ARRIVAL", true],
    ]);
    expect(rows.filter(isHandledRow)).toEqual([]);
  });

  it("arrived on the new date: the original-date row is done", async () => {
    const db = fakeDb([{ ...tahel, status: "ARRIVED" }]);
    const rows = await fetchInterviewRows(db as never, { ...win, typeMode: "phone" });
    const original = rows.find((r) => r.postponedOriginal)!;
    expect(original.current_status).toBe("ARRIVED");
    expect(isHandledRow(original)).toBe(true);
    expect(isHandledRow(rows.find((r) => !r.postponedOriginal)!)).toBe(false);
  });
});

describe("isHandledRow", () => {
  it("a final outcome is handled, a pending one is not", () => {
    expect(isHandledRow({ status: "NO_SHOW", current_status: "NO_SHOW" })).toBe(true);
    expect(isHandledRow({ status: "INTERVIEW_BOOKED", current_status: "INTERVIEW_BOOKED" })).toBe(false);
    expect(isHandledRow({ status: "ARRIVED", current_status: "ARRIVED" })).toBe(false);
  });
});
