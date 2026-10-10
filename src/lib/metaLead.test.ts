import { describe, expect, it } from "vitest";
import { evaluateScreening, metaLeadSource, parseMetaLead, screeningNote } from "./metaLead";

const raw = {
  leadgen_id: "1234567890",
  created_time: "2026-10-07T09:15:00+0000",
  form_id: "f1",
  campaign_id: "c1",
  campaign_name: "פיילוט מלונות אילת",
  adset_id: "s1",
  ad_id: "a1",
  ad_name: "מתחילים השבוע",
  field_data: [
    { name: "full_name", values: ["ישראל ישראלי"] },
    { name: "phone_number", values: ["+972 50-123-4567"] },
    { name: "role", values: ["מלצרות"] },
    { name: "over_18", values: ["כן"] },
    { name: "weekends", values: ["כן"] },
    { name: "availability", values: ["1–3 חודשים"] },
    { name: "arrival", values: ["השבוע"] },
    { name: "eilat_ok", values: ["כן"] },
  ],
};

describe("parseMetaLead", () => {
  it("reads Meta's field_data and normalizes the phone", () => {
    const r = parseMetaLead(raw);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.lead.phone).toBe("0501234567");
    expect(r.lead.name).toBe("ישראל ישראלי");
    expect(r.lead.adId).toBe("a1");
    expect(r.lead.answers.role).toBe("מלצרות");
  });

  it("accepts flat fields mapped by hand in Make", () => {
    const r = parseMetaLead({ leadgen_id: "9", full_name: "דנה", phone: "0521112233", answers: { weekends: "לא" } });
    expect(r.ok && r.lead.phone).toBe("0521112233");
    expect(r.ok && r.lead.answers.weekends).toBe("לא");
  });

  it("joins first and last name when there is no full name", () => {
    const r = parseMetaLead({
      leadgen_id: "9",
      field_data: [
        { name: "first_name", values: ["דנה"] },
        { name: "last_name", values: ["כהן"] },
        { name: "phone_number", values: ["0521112233"] },
      ],
    });
    expect(r.ok && r.lead.name).toBe("דנה כהן");
  });

  it("reads the Hebrew form, whose keys and answers Meta builds from the Hebrew text", () => {
    // המפתחות כפי ש-Meta החזירה לטופס "פיילוט פנימי אילת עברית" (10.10)
    const r = parseMetaLead({
      leadgen_id: "77",
      field_data: [
        { name: "שם_מלא", values: ["דנה כהן"] },
        { name: "מספר_טלפון", values: ["+972521112233"] },
        { name: "איזה_תפקיד_מעניין_אותך?", values: ["כל_תפקיד"] },
        { name: "האם_את/ה_בן/בת_18_ומעלה?", values: ["כן"] },
        { name: "יכול/ה_לעבוד_בסופי_שבוע?", values: ["כן"] },
        { name: "לכמה_זמן_את/ה_זמין/ה_לעבוד?", values: ["פחות_מחודש"] },
        { name: "מתי_תוכל/י_להגיע_לאילת?", values: ["השבוע"] },
        { name: "העבודה_באילת_ונדרשת_הגעה_לשם._מתאים_לך?", values: ["כן"] },
      ],
    });
    if (!r.ok) throw new Error(r.error);
    expect(r.lead.name).toBe("דנה כהן");
    expect(r.lead.phone).toBe("0521112233");
    expect(r.lead.answers).toEqual({
      role: "כל תפקיד",
      over_18: "כן",
      weekends: "כן",
      availability: "פחות מחודש",
      arrival: "השבוע",
      eilat_ok: "כן",
    });
    expect(evaluateScreening(r.lead.answers).failed).toEqual(["availability"]);
  });

  it("rejects a lead without an id or a phone", () => {
    expect(parseMetaLead({ phone: "0501234567" }).ok).toBe(false);
    expect(parseMetaLead({ leadgen_id: "1" }).ok).toBe(false);
    expect(parseMetaLead(null).ok).toBe(false);
  });
});

describe("evaluateScreening", () => {
  const ok = { over_18: "כן", weekends: "כן", availability: "יותר מ-3 חודשים", arrival: "השבוע", eilat_ok: "כן" };

  it("passes when every condition holds", () => {
    expect(evaluateScreening(ok)).toEqual({ passed: true, failed: [], missing: [] });
  });

  it("fails each condition on its own", () => {
    expect(evaluateScreening({ ...ok, over_18: "לא" }).failed).toEqual(["over_18"]);
    expect(evaluateScreening({ ...ok, weekends: "לא" }).failed).toEqual(["weekends"]);
    expect(evaluateScreening({ ...ok, availability: "פחות מחודש" }).failed).toEqual(["availability"]);
    expect(evaluateScreening({ ...ok, arrival: "תוך שבועיים" }).failed).toEqual(["arrival"]);
    expect(evaluateScreening({ ...ok, eilat_ok: "לא" }).failed).toEqual(["eilat_ok"]);
  });

  it("does not pass with missing answers, without calling them failures", () => {
    const s = evaluateScreening({ over_18: "כן" });
    expect(s.passed).toBe(false);
    expect(s.failed).toEqual([]);
    expect(s.missing).toContain("weekends");
  });

  it("does not require a role or experience", () => {
    expect(evaluateScreening(ok).passed).toBe(true);
  });
});

describe("note and source", () => {
  it("marks failed answers and names the ad", () => {
    const r = parseMetaLead({ ...raw, field_data: [...raw.field_data, { name: "weekends", values: ["לא"] }] });
    if (!r.ok) throw new Error("parse");
    // the first value wins; build a failing lead explicitly
    const lead = { ...r.lead, answers: { ...r.lead.answers, weekends: "לא" } };
    const note = screeningNote(lead, evaluateScreening(lead.answers));
    expect(note).toContain("סופי שבוע: לא ✗");
    expect(note).toContain("מודעה: פיילוט מלונות אילת · מתחילים השבוע");
  });

  it("uses the source format leadChannel already classifies as paid Facebook", () => {
    const r = parseMetaLead(raw);
    if (!r.ok) throw new Error("parse");
    expect(metaLeadSource(r.lead)).toBe("פייסבוק - פיילוט מלונות אילת");
  });
});
