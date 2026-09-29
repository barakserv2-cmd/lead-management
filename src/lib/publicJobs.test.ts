import { describe, expect, it } from "vitest";
import { parsePay, publicTitle, toPublicJobs, type JobRow } from "./publicJobs";

const row = (over: Partial<JobRow>): JobRow => ({
  title: "מלצר",
  location: "אילת",
  pay_rate: "40",
  requirements: [],
  urgent: false,
  client_type: "Hotel",
  ...over,
});

describe("publicTitle", () => {
  it("expands shorthand and folds plural/gender variants into one name", () => {
    expect(publicTitle("ע.טבח")).toBe("עוזר/ת טבח");
    expect(publicTitle("ש.כלים")).toBe("שוטף/ת כלים");
    expect(publicTitle("שטיפת כלים")).toBe("שוטף/ת כלים");
    expect(publicTitle("שוטפי כלים")).toBe("שוטף/ת כלים");
    expect(publicTitle("מלצרים")).toBe("מלצר/ית");
    expect(publicTitle("פקידת קבלה")).toBe("פקיד/ת קבלה");
    expect(publicTitle("פקידי קבלה")).toBe("פקיד/ת קבלה");
    expect(publicTitle("צקרים")).toBe("צ'קר/ית");
    expect(publicTitle("צ'קריות")).toBe("צ'קר/ית");
    expect(publicTitle("שטחים ציבוריים")).toBe("ניקיון שטחים ציבוריים");
    expect(publicTitle("ניקיון שטחים ציבורים")).toBe("ניקיון שטחים ציבוריים");
  });
  it("keeps distinct roles apart", () => {
    expect(publicTitle("טבח חלבי")).toBe("טבח חלבי");
    expect(publicTitle("מלצר אקסטרה חגים")).toBe("מלצר אקסטרה חגים");
    expect(publicTitle("  סגן   מנהל משק ")).toBe("סגן מנהל משק");
  });
});

describe("parsePay", () => {
  it("reads the formats recruiters use", () => {
    expect(parsePay("40")).toEqual({ min: 40, max: 40, bonus: false });
    expect(parsePay("37-40")).toEqual({ min: 37, max: 40, bonus: false });
    expect(parsePay("45+2")).toEqual({ min: 45, max: 45, bonus: true });
    expect(parsePay("40+")).toEqual({ min: 40, max: 40, bonus: true });
    expect(parsePay("39.40")).toEqual({ min: 39.4, max: 39.4, bonus: false });
  });
  it("ignores free text and empty values", () => {
    expect(parsePay("תלוי")).toBeNull();
    expect(parsePay("מעמד הראיון")).toBeNull();
    expect(parsePay(null)).toBeNull();
  });
});

describe("toPublicJobs", () => {
  it("merges duplicates across pay rates into one card with a pay range", () => {
    const out = toPublicJobs([
      row({ title: "נגר", pay_rate: "45-50" }),
      row({ title: "נגר", pay_rate: "42-45" }),
    ]);
    expect(out).toEqual([
      expect.objectContaining({ title: "נגר", pay: "42-50", count: 2, payBonus: false }),
    ]);
  });

  it("merges name variants and keeps a single pay when all agree", () => {
    const out = toPublicJobs([row({ title: "מלצרים" }), row({ title: "מלצר", pay_rate: "40" })]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ title: "מלצר/ית", pay: "40", count: 2 });
  });

  it("ignores free-text pay inside a range and flags bonuses", () => {
    const out = toPublicJobs([
      row({ title: "קונדיטור", pay_rate: "45+2" }),
      row({ title: "קונדיטור", pay_rate: "תלוי" }),
      row({ title: "קונדיטור", pay_rate: null }),
    ]);
    expect(out[0]).toMatchObject({ title: "קונדיטור/ית", pay: "45", payBonus: true, count: 3 });
  });

  it("has no pay when no row has a number", () => {
    const out = toPublicJobs([row({ title: "סגן מנהל משק", pay_rate: null })]);
    expect(out[0].pay).toBeNull();
  });

  it("puts urgent roles first and marks a merged role urgent if any row is", () => {
    const out = toPublicJobs([row({ title: "ברמן" }), row({ title: "טבח חלבי" }), row({ title: "ברמנים", urgent: true })]);
    expect(out.map((j) => j.title)).toEqual(["ברמן/ית", "טבח חלבי"]);
    expect(out[0].urgent).toBe(true);
  });

  it("maps sectors, including the Hotels typo, and defaults the location", () => {
    const out = toPublicJobs([row({ client_type: "Hotels", location: "" }), row({ title: "x", client_type: "Other" })]);
    expect(out[0]).toMatchObject({ sector: "מלונאות", location: "אילת" });
    expect(out[1].sector).toBeNull();
  });

  it("never carries employer fields and skips empty titles", () => {
    const out = toPublicJobs([row({ title: " " }), row({})]);
    expect(out).toHaveLength(1);
    expect(Object.keys(out[0]).sort()).toEqual(
      ["count", "location", "pay", "payBonus", "requirements", "sector", "title", "urgent"],
    );
  });
});
