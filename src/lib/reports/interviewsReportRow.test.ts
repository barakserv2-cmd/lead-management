import { describe, expect, it } from "vitest";
import { isInPersonInterview } from "./interviewsReportRow";

describe("דוח ראיונות — רק פרונטליים", () => {
  it("ראיון פרונטלי נכנס לדוח", () => {
    expect(isInPersonInterview({ interview_type: "in_person" })).toBe(true);
  });

  it("ראיון ישן בלי סוג נכנס — רכזת קבעה אותו ידנית", () => {
    expect(isInPersonInterview({ interview_type: null })).toBe(true);
    expect(isInPersonInterview({})).toBe(true);
  });

  it("טלפוני ווידאו לא נכנסים — אף אחד לא מגיע למשרד", () => {
    expect(isInPersonInterview({ interview_type: "phone" })).toBe(false);
    expect(isInPersonInterview({ interview_type: "video" })).toBe(false);
  });
});
