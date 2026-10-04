import { describe, it, expect, afterEach } from "vitest";
import {
  planTouch,
  detectArrivalSignals,
  signalReason,
  touchMessage,
  whenLabel,
  arrivalCompanionEnabledFor,
  planFirstDayTouch,
  firstDayMessage,
  ARRIVAL_TEMPLATES,
  templateParams,
  renderTemplate,
  type PlanInput,
  type TouchType,
} from "./arrivalCompanion";

function plan(over: Partial<PlanInput>): TouchType | null {
  return planTouch({
    daysAhead: 3,
    interviewHour: 10,
    hourNow: 12,
    sent: new Set(),
    sentToday: new Set(),
    weekday: 2,
    ...over,
  });
}

describe("planTouch", () => {
  it("confirms an interview booked two or more days ahead, once", () => {
    expect(plan({ daysAhead: 5 })).toBe("confirm");
    expect(plan({ daysAhead: 5, sent: new Set(["confirm"]) })).toBeNull();
  });

  it("checks travel two days before when the confirmation went out earlier", () => {
    expect(plan({ daysAhead: 2, sent: new Set(["confirm"]) })).toBe("travel_check");
    expect(plan({ daysAhead: 2, sent: new Set(["confirm", "travel_check"]) })).toBeNull();
  });

  it("sends at most one proactive message a day", () => {
    const today = new Set<TouchType>(["confirm"]);
    expect(plan({ daysAhead: 2, sent: today, sentToday: today })).toBeNull();
  });

  it("leaves the day before to the existing 16:30 reminder", () => {
    expect(plan({ daysAhead: 1 })).toBeNull();
  });

  it("sends the morning message only between 08:00 and 10:00 and only for late interviews", () => {
    expect(plan({ daysAhead: 0, hourNow: 8, interviewHour: 13 })).toBe("day_of");
    expect(plan({ daysAhead: 0, hourNow: 8, interviewHour: null })).toBe("day_of");
    expect(plan({ daysAhead: 0, hourNow: 8, interviewHour: 9 })).toBeNull();
    expect(plan({ daysAhead: 0, hourNow: 11, interviewHour: 13 })).toBeNull();
  });

  it("stays quiet outside daytime hours and on Shabbat", () => {
    expect(plan({ hourNow: 21 })).toBeNull();
    expect(plan({ hourNow: 9 })).toBeNull();
    expect(plan({ weekday: 6 })).toBeNull();
  });
});

describe("detectArrivalSignals", () => {
  it("spots a candidate cancelling", () => {
    expect(detectArrivalSignals("סליחה אני לא אגיע").risk).toBe("cancelling");
    expect(detectArrivalSignals("מצאתי עבודה במרכז").risk).toBe("cancelling");
  });

  it("spots hesitation", () => {
    expect(detectArrivalSignals("אני עוד לא בטוח").risk).toBe("hesitant");
    expect(detectArrivalSignals("אפשר לדחות לשבוע הבא?").risk).toBe("hesitant");
  });

  it("recognises a friend backing out without treating it as the candidate cancelling", () => {
    const s = detectArrivalSignals("החבר שלי לא מגיע, אני עדיין בא");
    expect(s.friendBackedOut).toBe(true);
    expect(s.risk).toBe("hesitant");
    expect(s.comesWithFriend).toBe(false);
  });

  it("reads whether they come alone or with someone", () => {
    expect(detectArrivalSignals("מגיע עם החברה שלי").comesWithFriend).toBe(true);
    expect(detectArrivalSignals("אני מגיע לבד").comesWithFriend).toBe(false);
    expect(detectArrivalSignals("סבבה תודה").comesWithFriend).toBeNull();
  });

  it("does not see a brother inside unrelated words", () => {
    const s = detectArrivalSignals("אחרי זה אני יוצא לתחנה, הכל טוב");
    expect(s.friendBackedOut).toBe(false);
    expect(s.risk).toBe("none");
    expect(signalReason(s, "דני", "…")).toBeNull();
  });

  it("builds a recruiter-facing reason", () => {
    const r = signalReason(detectArrivalSignals("החבר התחרט"), "דני", "החבר התחרט");
    expect(r).toContain("דני");
    expect(r).toContain("התחרט");
  });
});

describe("messages", () => {
  const lead = { name: "דני כהן", interview_date: "2026-10-01T10:00:00+00:00", comes_with_friend: null };

  it("formats the interview time in Israel wall-clock", () => {
    expect(whenLabel(lead.interview_date)).toBe("ביום חמישי 1.10 בשעה 10:00");
  });

  it("asks about a friend only when it is still unknown, and about travel two days before", () => {
    const m = touchMessage("confirm", lead, 2);
    expect(m).toContain("היי דני");
    expect(m).toContain("חבר/ה");
    expect(m).toContain("כרטיס");
    const known = touchMessage("confirm", { ...lead, comes_with_friend: false }, 5);
    expect(known).not.toContain("חבר/ה");
    expect(known).not.toContain("כרטיס");
  });
});

describe("arrivalCompanionEnabledFor", () => {
  afterEach(() => {
    delete process.env.ARRIVAL_COMPANION_MODE;
    delete process.env.ARRIVAL_COMPANION_TEST_PHONES;
  });

  it("is off by default and on for pilot phones", () => {
    expect(arrivalCompanionEnabledFor("0501234567")).toBe(false);
    process.env.ARRIVAL_COMPANION_TEST_PHONES = "050-1234567";
    expect(arrivalCompanionEnabledFor("+972501234567")).toBe(true);
    expect(arrivalCompanionEnabledFor("0529999999")).toBe(false);
    process.env.ARRIVAL_COMPANION_MODE = "live";
    expect(arrivalCompanionEnabledFor("0529999999")).toBe(true);
  });
});

describe("first days at work", () => {
  it("asks how the first day went one or two days after starting, in daytime, not on Shabbat", () => {
    const base = { hourNow: 12, weekday: 2, sent: false };
    expect(planFirstDayTouch({ ...base, daysSinceStart: 1 })).toBe(true);
    expect(planFirstDayTouch({ ...base, daysSinceStart: 2 })).toBe(true);
    expect(planFirstDayTouch({ ...base, daysSinceStart: 0 })).toBe(false);
    expect(planFirstDayTouch({ ...base, daysSinceStart: 3 })).toBe(false);
    expect(planFirstDayTouch({ ...base, daysSinceStart: 1, sent: true })).toBe(false);
    expect(planFirstDayTouch({ ...base, daysSinceStart: 1, weekday: 6 })).toBe(false);
    expect(planFirstDayTouch({ ...base, daysSinceStart: 1, hourNow: 21 })).toBe(false);
  });

  it("names the employer in the first-day message", () => {
    expect(firstDayMessage({ name: "דני כהן", hired_client: "אסטרל" })).toContain("היום הראשון באסטרל");
  });

  it("recognises a new worker who wants to leave", () => {
    expect(detectArrivalSignals("אני חוזר הביתה, זה לא בשבילי", "first_days").risk).toBe("cancelling");
    expect(detectArrivalSignals("לא מגיע מחר לעבודה", "first_days").risk).toBe("cancelling");
    expect(detectArrivalSignals("הדירה מלוכלכת ואין מזגן", "first_days").risk).toBe("hesitant");
  });

  it("does not read travel talk before arrival as leaving", () => {
    expect(detectArrivalSignals("האוטובוס עוזב ב-8 בבוקר").risk).toBe("none");
  });

  it("writes a first-days reason with the day number", () => {
    const s = detectArrivalSignals("רוצה לעזוב", "first_days");
    const r = signalReason(s, "דני", "רוצה לעזוב", { kind: "first_days", day: 2 });
    expect(r).toContain("ביום 2 לעבודה");
    expect(r?.startsWith("🚩")).toBe(true);
  });
});

describe("official-number templates", () => {
  it("has a template for every touch, with as many params as placeholders", () => {
    const lead = { name: "דני כהן", interview_date: "2026-10-01T10:00:00+00:00", hired_client: "אסטרל" };
    for (const touch of ["confirm", "travel_check", "day_of", "first_day"] as const) {
      const tpl = ARRIVAL_TEMPLATES[touch];
      const placeholders = new Set(tpl.body.match(/\{\{\d+\}\}/g) ?? []).size;
      const params = templateParams(touch, lead);
      expect(params).toHaveLength(placeholders);
      expect(params.every((p) => p.trim().length > 0)).toBe(true);
      expect(renderTemplate(tpl.body, params)).not.toMatch(/\{\{/);
    }
  });

  it("never sends an empty param when the name or employer is missing", () => {
    expect(templateParams("first_day", { name: null, hired_client: null })).toEqual(["חבר/ה", "עבודה"]);
    expect(templateParams("confirm", { name: "  ", interview_date: null })).toEqual(["חבר/ה", "בקרוב"]);
  });

  it("renders the confirm template with the interview time", () => {
    const params = templateParams("confirm", { name: "דני כהן", interview_date: "2026-10-01T10:00:00+00:00" });
    expect(renderTemplate(ARRIVAL_TEMPLATES.confirm.body, params)).toContain("היי דני, כאן ברק שירותים. הראיון שלך באילת נקבע ביום חמישי 1.10 בשעה 10:00");
  });
});
