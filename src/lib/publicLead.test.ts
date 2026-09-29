import { describe, expect, it } from "vitest";
import {
  NEW_SITE_SOURCE,
  isAllowedOrigin,
  parsePublicLead,
  rateLimited,
  sourceForPublicLead,
} from "./publicLead";

const valid = { name: "נועה כהן", phone: "050-123-4567", consent: true };

describe("parsePublicLead", () => {
  it("accepts a valid lead and normalises the phone", () => {
    const r = parsePublicLead({
      ...valid,
      interest: "מלונאות",
      consent_version: "2026-09-29",
      utm: { source: "google", medium: "cpc" },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.lead.phone).toBe("0501234567");
    expect(r.lead.interest).toBe("מלונאות");
    expect(r.lead.utm.source).toBe("google");
    expect(r.lead.consentVersion).toBe("2026-09-29");
  });

  it("accepts +972 numbers", () => {
    const r = parsePublicLead({ ...valid, phone: "+972 50 123 4567" });
    expect(r.ok && r.lead.phone).toBe("0501234567");
  });

  it("rejects a filled honeypot", () => {
    expect(parsePublicLead({ ...valid, company: "x" })).toEqual({ ok: false, error: "bot" });
  });

  it("requires explicit consent", () => {
    expect(parsePublicLead({ ...valid, consent: "true" })).toEqual({ ok: false, error: "consent" });
    expect(parsePublicLead({ name: "נועה", phone: "0501234567" })).toEqual({ ok: false, error: "consent" });
  });

  it("rejects a missing or one-letter name", () => {
    expect(parsePublicLead({ ...valid, name: " " })).toEqual({ ok: false, error: "name" });
    expect(parsePublicLead({ ...valid, name: "א" })).toEqual({ ok: false, error: "name" });
  });

  it("rejects numbers that are not Israeli", () => {
    expect(parsePublicLead({ ...valid, phone: "12345" })).toEqual({ ok: false, error: "phone" });
    expect(parsePublicLead({ ...valid, phone: "+1 415 555 0100" })).toEqual({ ok: false, error: "phone" });
  });

  it("strips markup and clips long fields", () => {
    const r = parsePublicLead({ ...valid, name: "<b>נועה</b>" + "א".repeat(100), interest: "x".repeat(99) });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.lead.name).not.toMatch(/[<>]/);
    expect(r.lead.name.length).toBeLessThanOrEqual(60);
    expect(r.lead.interest?.length).toBe(40);
  });

  it("survives garbage bodies", () => {
    expect(parsePublicLead(null).ok).toBe(false);
    expect(parsePublicLead("x").ok).toBe(false);
  });
});

describe("sourceForPublicLead", () => {
  const utm = (source: string | null, medium: string | null = null) => ({ source, medium, campaign: null });
  it("is the new-site source without UTM", () => {
    expect(sourceForPublicLead(utm(null))).toBe(NEW_SITE_SOURCE);
  });
  it("maps paid campaigns like the old site forms", () => {
    expect(sourceForPublicLead(utm("google", "cpc"))).toBe("גוגל ממומן");
    expect(sourceForPublicLead(utm("facebook"))).toBe("פייסבוק");
    expect(sourceForPublicLead(utm("tiktok"))).toBe("טיקטוק");
  });
  it("keeps organic google on the new-site source", () => {
    expect(sourceForPublicLead(utm("google", "organic"))).toBe(NEW_SITE_SOURCE);
  });
});

describe("isAllowedOrigin", () => {
  it("matches only listed origins", () => {
    const list = "https://start.eilatjobs.com, https://www.eilatjobs.com";
    expect(isAllowedOrigin("https://start.eilatjobs.com", list)).toBe(true);
    expect(isAllowedOrigin("https://evil.example", list)).toBe(false);
    expect(isAllowedOrigin(null, list)).toBe(false);
    expect(isAllowedOrigin("https://start.eilatjobs.com", undefined)).toBe(false);
  });
});

describe("rateLimited", () => {
  it("allows five hits in the window and blocks the sixth", () => {
    const t = 1_000_000;
    for (let i = 0; i < 5; i++) expect(rateLimited("ip-a", t + i)).toBe(false);
    expect(rateLimited("ip-a", t + 10)).toBe(true);
    expect(rateLimited("ip-b", t + 10)).toBe(false);
    expect(rateLimited("ip-a", t + 11 * 60 * 1000)).toBe(false);
  });
});
