import { describe, it, expect, vi, beforeEach } from "vitest";

const alertViaGubget = vi.fn<(a: { to?: string; title: string; text?: string }) => Promise<string | null>>();
vi.mock("@/lib/gubgetAlert", () => ({ alertViaGubget: (a: never) => alertViaGubget(a) }));

import { guaranteeDigest, guaranteeDue, sendGuaranteeDigest, type GuaranteeDue } from "./postPlacement";

const TODAY = "2026-10-04";
const lead = (id: string, start: string | null, client: string | null = null, name: string | null = `עובד ${id}`) => ({
  id,
  name,
  hired_client: client,
  start_date: start,
});

describe("guaranteeDue", () => {
  const byClient = new Map([["מלון ים", 30]]);

  it("1 to 7 days left — in; more, none or past — out", () => {
    const due = guaranteeDue(
      [
        lead("a", "2026-09-07"), // 60-day default, 33 days in → 27 left
        lead("b", "2026-08-07"), // 58 days in → 2 left
        lead("c", "2026-08-01"), // 64 days in → past
        lead("d", "2026-08-11"), // 54 days in → 6 left
        lead("e", null),
      ],
      60,
      byClient,
      TODAY
    );
    expect(due.map((d) => [d.lead.id, d.remaining])).toEqual([
      ["b", 2],
      ["d", 6],
    ]);
  });

  it("a client's own guarantee period wins over the default", () => {
    const due = guaranteeDue([lead("h", "2026-09-07", "מלון ים")], 60, byClient, TODAY);
    expect(due).toEqual([{ lead: expect.objectContaining({ id: "h" }), remaining: 3, key: "guarantee:h" }]);
  });

  it("a week-long window: a run missed on Shabbat is caught the next day", () => {
    // 4 left on Sunday: entered the window on Wednesday, still caught after
    // Friday's and Saturday's runs were held for Shabbat
    expect(guaranteeDue([lead("s", "2026-08-09")], 60, new Map(), TODAY)[0].remaining).toBe(4);
  });

  it("zero-day guarantee — never", () => {
    expect(guaranteeDue([lead("z", "2026-10-01")], 0, new Map(), TODAY)).toEqual([]);
  });
});

describe("guaranteeDigest", () => {
  const item = (id: string, remaining: number, client: string | null = null): GuaranteeDue => ({
    lead: { id, name: `עובד ${id}`, hired_client: client },
    remaining,
    key: `guarantee:${id}`,
  });

  it("one worker: named in the subject", () => {
    const d = guaranteeDigest([item("a", 1, "מלון ים")]);
    expect(d.subject).toBe("עובד a (מלון ים) — עוד 1 יום");
    expect(d.text).toContain("• עובד a (מלון ים) — עוד 1 יום");
  });

  it("several: a count in the subject, all of them in the text", () => {
    const d = guaranteeDigest([item("a", 2), item("b", 5)]);
    expect(d.subject).toBe("2 עובדים");
    expect(d.text).toContain("• עובד a — עוד 2 ימים");
    expect(d.text).toContain("• עובד b — עוד 5 ימים");
    expect(d.reason).not.toContain("\n");
  });

  it("a long list stays inside the template's one-line limit", () => {
    const many = Array.from({ length: 60 }, (_, i) => item(String(i), 3, "מלון עם שם ארוך במיוחד"));
    expect(guaranteeDigest(many).reason.length).toBeLessThanOrEqual(900);
  });
});

describe("sendGuaranteeDigest", () => {
  const items: GuaranteeDue[] = [{ lead: { id: "a", name: "דנה", hired_client: null }, remaining: 3, key: "guarantee:a" }];

  beforeEach(() => alertViaGubget.mockReset());

  it("goes to Mali through גובגט", async () => {
    alertViaGubget.mockResolvedValue(null);
    expect(await sendGuaranteeDigest(items)).toEqual({ ok: true, via: "מלי" });
    expect(alertViaGubget).toHaveBeenCalledTimes(1);
    expect(alertViaGubget.mock.calls[0][0].to).toBe("מלי");
  });

  it("גובגט can't reach Mali → the admin gets it, marked as hers", async () => {
    alertViaGubget.mockResolvedValueOnce("unknown recipient").mockResolvedValueOnce(null);
    expect(await sendGuaranteeDigest(items)).toEqual({ ok: true, via: "admins" });
    const second = alertViaGubget.mock.calls[1][0];
    expect(second.to).toBe("admins");
    expect(second.title).toContain("למלי");
  });

  it("neither got it → not sent, both reasons kept, so the next run retries", async () => {
    alertViaGubget.mockResolvedValue("down");
    const res = await sendGuaranteeDigest(items);
    expect(res).toEqual({ ok: false, error: "מלי: down · admins: down" });
  });
});
