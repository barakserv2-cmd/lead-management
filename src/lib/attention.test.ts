import { describe, it, expect } from "vitest";
import { attentionKind, isExpiredGuaranteeFlag, isClosedStatus } from "./attention";

describe("isClosedStatus", () => {
  it("treats final outcomes as closed and the live pipeline as open", () => {
    for (const s of ["NOT_SUITABLE", "LOST_CONTACT", "REJECTED", "NOT_ACCEPTED", "NO_SHOW", "CANCELLED_ARRIVAL", "EMPLOYMENT_ENDED", "INVALID_PHONE"]) {
      expect(isClosedStatus(s)).toBe(true);
    }
    for (const s of ["NEW_LEAD", "CONTACTED", "INTERVIEW_BOOKED", "POSTPONED_ARRIVAL", "ARRIVED", "HIRED", "STARTED"]) {
      expect(isClosedStatus(s)).toBe(false);
    }
    expect(isClosedStatus(null)).toBe(false);
  });
});

describe("attentionKind", () => {
  it("classifies by the reason prefix", () => {
    expect(attentionKind("🚩 מלווה ההגעה: דני — החבר התחרט")).toBe("urgent");
    expect(attentionKind("⏳ תקופת האחריות של דני בישרוטל נגמרת בעוד 7 ימים")).toBe("guarantee");
    expect(attentionKind("שואל על תנאי שכר")).toBe("normal");
    expect(attentionKind(null)).toBe("normal");
  });
});

describe("isExpiredGuaranteeFlag", () => {
  const now = new Date("2026-09-29T10:00:00Z");
  const g = "⏳ תקופת האחריות של דני נגמרת בעוד 7 ימים";

  it("expires a guarantee reminder once the guarantee has passed", () => {
    expect(isExpiredGuaranteeFlag(g, "2026-09-20T10:00:00Z", now)).toBe(true);
    expect(isExpiredGuaranteeFlag(g, "2026-09-25T10:00:00Z", now)).toBe(false);
  });

  it("never expires other kinds of flags", () => {
    expect(isExpiredGuaranteeFlag("🚩 מלווה ההגעה", "2026-08-01T10:00:00Z", now)).toBe(false);
    expect(isExpiredGuaranteeFlag("שאלה", "2026-08-01T10:00:00Z", now)).toBe(false);
    expect(isExpiredGuaranteeFlag(g, null, now)).toBe(false);
  });
});
