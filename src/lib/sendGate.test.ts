import { describe, it, expect } from "vitest";
import { restPeriodAt, isQuietTimeNow, isTemporaryBlock, isOptOutMessage } from "./sendGate";

// Israel wall clock → Date. September–October 2026 is summer time (+03:00).
const il = (wall: string) => new Date(`${wall}:00+03:00`);

describe("restPeriodAt — שבת", () => {
  it("Friday morning is open, Friday from 14:00 is Shabbat", () => {
    expect(restPeriodAt(il("2026-10-09T13:59"))).toBeNull();
    expect(restPeriodAt(il("2026-10-09T14:00"))).toBe("שבת");
    expect(restPeriodAt(il("2026-10-09T21:00"))).toBe("שבת");
  });

  it("Saturday is blocked until 20:00", () => {
    expect(restPeriodAt(il("2026-10-10T10:00"))).toBe("שבת");
    expect(restPeriodAt(il("2026-10-10T19:59"))).toBe("שבת");
    expect(restPeriodAt(il("2026-10-10T20:00"))).toBeNull();
  });

  it("an ordinary weekday is open", () => {
    expect(restPeriodAt(il("2026-10-13T16:30"))).toBeNull();
  });
});

describe("restPeriodAt — חגים (תשפ״ז)", () => {
  it("Yom Kippur 21.09.2026: the eve from 14:00 and the day until 20:00", () => {
    expect(restPeriodAt(il("2026-09-20T13:00"))).toBeNull();
    // the interview-reminder run that went out on Yom Kippur in the review
    expect(restPeriodAt(il("2026-09-20T16:30"))).toBe("יום כיפור");
    expect(restPeriodAt(il("2026-09-21T16:30"))).toBe("יום כיפור");
    expect(restPeriodAt(il("2026-09-21T20:30"))).toBeNull();
  });

  it("Rosh Hashana (Sat–Sun 12–13.09): blocked from Friday 14:00 to Sunday 20:00", () => {
    expect(restPeriodAt(il("2026-09-11T15:00"))).not.toBeNull();
    expect(restPeriodAt(il("2026-09-12T21:00"))).toBe("ראש השנה ב׳");
    expect(restPeriodAt(il("2026-09-13T12:00"))).toBe("ראש השנה ב׳");
    expect(restPeriodAt(il("2026-09-13T20:00"))).toBeNull();
  });

  it("chol hamoed is open", () => {
    expect(restPeriodAt(il("2026-09-28T12:00"))).toBeNull();
  });
});

describe("isQuietTimeNow", () => {
  it("covers both the night window and rest periods", () => {
    expect(isQuietTimeNow(il("2026-10-13T23:00"))).toBe(true); // night
    expect(isQuietTimeNow(il("2026-10-10T12:00"))).toBe(true); // Shabbat
    expect(isQuietTimeNow(il("2026-10-13T12:00"))).toBe(false);
  });
});

describe("isTemporaryBlock", () => {
  it("defers quiet time and gate errors, but not opt-outs", () => {
    expect(isTemporaryBlock("quiet_hours")).toBe(true);
    expect(isTemporaryBlock("gate_error")).toBe(true);
    expect(isTemporaryBlock("do_not_contact")).toBe(false);
    expect(isTemporaryBlock(undefined)).toBe(false);
  });
});

describe("isOptOutMessage", () => {
  it("catches explicit removal requests only", () => {
    expect(isOptOutMessage("הסר")).toBe(true);
    expect(isOptOutMessage("תסירו אותי בבקשה")).toBe(true);
    expect(isOptOutMessage("STOP")).toBe(true);
    expect(isOptOutMessage("לא מעוניין במשרה הזאת")).toBe(false);
  });
});
