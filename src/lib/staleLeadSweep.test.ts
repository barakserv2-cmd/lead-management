import { describe, expect, it } from "vitest";
import { sweepVerdict, OWNER_SILENT_HOURS, type SweepLead } from "./staleLeadSweep";

const OPEN = ["NEW_LEAD", "CONTACTED", "SCREENING_IN_PROGRESS", "FIT_FOR_INTERVIEW"];
const NOW = new Date("2026-09-24T12:00:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3600_000).toISOString();

const base: SweepLead = {
  phone: "0541234567", source: "פייסבוק - BARAK", status: "NEW_LEAD",
  created_at: hoursAgo(5), handled_by: null, handled_at: null,
  do_not_contact: false, hasOutbound: false,
};

describe("sweepVerdict", () => {
  it("ליד שאיש לא פנה אליו ואין לו בעלים — חוזר לגובגט", () => {
    expect(sweepVerdict(base, OPEN, NOW)).toEqual({ push: true, why: "never_pushed" });
  });

  it("גובגט כבעלים נחשב כחסר בעלים — הוא זה שאמור לפתוח", () => {
    const l = { ...base, handled_by: "gubget@eilatjobs.com", handled_at: hoursAgo(9) };
    expect(sweepVerdict(l, OPEN, NOW).push).toBe(true);
  });

  it("רכזת שמחזיקה בשקט מעבר לסף — גובגט פותח", () => {
    const l = { ...base, handled_by: "hoshen@eilatjobs.com", handled_at: hoursAgo(OWNER_SILENT_HOURS + 1) };
    expect(sweepVerdict(l, OPEN, NOW)).toEqual({ push: true, why: "owner_silent" });
  });

  it("רכזת שקיבלה את הליד ממש עכשיו — לא נוגעים", () => {
    const l = { ...base, handled_by: "hoshen@eilatjobs.com", handled_at: hoursAgo(1) };
    expect(sweepVerdict(l, OPEN, NOW)).toEqual({ push: false, why: "owner_fresh" });
  });

  it("הסף עצמו כבר נחשב שתיקה", () => {
    const l = { ...base, handled_by: "tami@eilatjobs.com", handled_at: hoursAgo(OWNER_SILENT_HOURS) };
    expect(sweepVerdict(l, OPEN, NOW).push).toBe(true);
  });

  it("בלי handled_at אין דרך לדעת — הנעילה הישנה נשארת", () => {
    const l = { ...base, handled_by: "tami@eilatjobs.com", handled_at: null };
    expect(sweepVerdict(l, OPEN, NOW)).toEqual({ push: false, why: "owner_no_timestamp" });
  });

  it("כבר יצאה הודעה — זו שיחה קיימת, לא פנייה ראשונה שנפלה", () => {
    const l = { ...base, hasOutbound: true, handled_by: "hoshen@eilatjobs.com", handled_at: hoursAgo(50) };
    expect(sweepVerdict(l, OPEN, NOW)).toEqual({ push: false, why: "already_contacted" });
  });

  it("סגור, DNC, בלי טלפון, או ליד של גובגט עצמו — לא נדחפים", () => {
    expect(sweepVerdict({ ...base, status: "REJECTED" }, OPEN, NOW).why).toBe("not_open");
    expect(sweepVerdict({ ...base, do_not_contact: true }, OPEN, NOW).why).toBe("dnc");
    expect(sweepVerdict({ ...base, phone: null }, OPEN, NOW).why).toBe("no_phone");
    expect(sweepVerdict({ ...base, source: "גובגט" }, OPEN, NOW).why).toBe("own_lead");
  });

  it("ליד בן ימים שנפל בחלון של 3 הדקות — עדיין נדחף", () => {
    expect(sweepVerdict({ ...base, created_at: hoursAgo(96) }, OPEN, NOW).why).toBe("never_pushed");
  });
});
