import { describe, expect, it } from "vitest";
import { publicTitle, toPublicJobs, type JobRow } from "./publicJobs";

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
  it("expands recruiter shorthand", () => {
    expect(publicTitle("ע.טבח")).toBe("עוזר/ת טבח");
    expect(publicTitle("ש.כלים")).toBe("שוטף/ת כלים");
    expect(publicTitle("צקרים")).toBe("צ'קרים");
  });
  it("leaves normal titles alone", () => {
    expect(publicTitle("  פקידי   קבלה ")).toBe("פקידי קבלה");
  });
});

describe("toPublicJobs", () => {
  it("merges the same title and pay across employers", () => {
    const out = toPublicJobs([row({}), row({}), row({ pay_rate: "42" })]);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ title: "מלצר", pay: "40", count: 2 });
    expect(out[1]).toMatchObject({ pay: "42", count: 1 });
  });

  it("puts urgent jobs first and keeps a merged group urgent", () => {
    const out = toPublicJobs([row({ title: "ברמן" }), row({ title: "טבח" }), row({ title: "ברמן", urgent: true })]);
    expect(out.map((j) => j.title)).toEqual(["ברמן", "טבח"]);
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
    expect(Object.keys(out[0]).sort()).toEqual(["count", "location", "pay", "requirements", "sector", "title", "urgent"]);
  });
});
