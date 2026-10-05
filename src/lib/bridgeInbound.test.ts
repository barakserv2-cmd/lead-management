import { describe, it, expect } from "vitest";
import { appendBridgeMessages, noteOnce, sameSlot, slotLabel, type InboundMessage } from "./bridgeInbound";

type Row = Record<string, unknown>;

/**
 * messages / lead_events in memory, with the filters the helpers use. Like the
 * real table, a row without created_at gets "now" (the clock below).
 */
function fakeDb(clock: { now: Date }, events: Row[] = []) {
  const messages: Row[] = [];
  let seq = 0;
  const table = (name: string) => (name === "messages" ? messages : events);
  return {
    messages,
    events,
    from(name: string) {
      const filters: ((r: Row) => boolean)[] = [];
      let desc = false;
      const hits = () => {
        const out = table(name).filter((r) => filters.every((f) => f(r)));
        return desc ? [...out].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))) : out;
      };
      const q = {
        select: () => q,
        eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), q),
        in: (c: string, vs: unknown[]) => {
          filters.push((r) => vs.includes(r[c]));
          return Promise.resolve({ data: hits(), error: null });
        },
        gte: (c: string, v: string) => (filters.push((r) => String(r[c]) >= v), q),
        lte: (c: string, v: string) => (filters.push((r) => String(r[c]) <= v), q),
        is: (c: string, v: null) => (filters.push((r) => (r[c] ?? null) === v), q),
        order: (_c: string, o: { ascending: boolean }) => ((desc = !o.ascending), q),
        limit: (n: number) => ({
          then: (res: (v: unknown) => void) => res({ data: hits().slice(0, n), error: null }),
          maybeSingle: async () => ({ data: hits()[0] ?? null, error: null }),
        }),
        insert: async (v: Row) => {
          table(name).push({ id: `r${++seq}`, created_at: clock.now.toISOString(), provider_msg_id: null, ...v });
          return { error: null };
        },
        update: (patch: Row) => ({
          eq: async (_c: string, id: string) => {
            const r = table(name).find((x) => x.id === id);
            if (r) Object.assign(r, patch);
            return { error: null };
          },
        }),
      };
      return q;
    },
  };
}

const user = (content: string): InboundMessage => ({ role: "user", content, providerMsgId: null, createdAt: null });
const bot = (content: string, id: string, at: string): InboundMessage => ({
  role: "assistant",
  content,
  providerMsgId: id,
  createdAt: at,
});
const t = (sec: number) => new Date(Date.UTC(2026, 9, 1, 9, 0, sec)).toISOString();

describe("appendBridgeMessages — the transcript keeps every real answer", () => {
  it("a candidate answering 'כן' to two questions a minute apart keeps both", async () => {
    const clock = { now: new Date(t(5)) };
    const db = fakeDb(clock);
    // Q1 → "כן" → Q2
    await appendBridgeMessages(db as never, "L1", [user("כן"), bot("עובד/ת בסופ\"ש?", "wamid.Q2", t(4))]);
    clock.now = new Date(t(40));
    // "כן" → Q3
    await appendBridgeMessages(db as never, "L1", [user("כן"), bot("מתי נוח להגיע?", "wamid.Q3", t(39))]);

    expect(db.messages.filter((m) => m.content === "כן")).toHaveLength(2);
    expect(db.messages).toHaveLength(4);
  });

  it("the same request sent again adds nothing", async () => {
    const clock = { now: new Date(t(5)) };
    const db = fakeDb(clock);
    const payload = [user("כן"), bot("מתי נוח להגיע?", "wamid.Q3", t(4))];
    expect(await appendBridgeMessages(db as never, "L1", payload)).toBe(2);
    clock.now = new Date(t(65)); // a retry a minute later
    expect(await appendBridgeMessages(db as never, "L1", payload)).toBe(0);
    expect(db.messages).toHaveLength(2);
  });

  it("reports only the messages it actually saved (for the arrival companion)", async () => {
    const clock = { now: new Date(t(5)) };
    const db = fakeDb(clock);
    const payload = [user("החבר שלי התחרט"), bot("מצטערים לשמוע", "wamid.Q9", t(4))];
    const first: InboundMessage[] = [];
    await appendBridgeMessages(db as never, "L1", payload, undefined, first);
    expect(first.map((m) => m.content)).toEqual(["החבר שלי התחרט", "מצטערים לשמוע"]);
    clock.now = new Date(t(65)); // the same payload again
    const again: InboundMessage[] = [];
    await appendBridgeMessages(db as never, "L1", payload, undefined, again);
    expect(again).toEqual([]);
  });

  it("a request with no ids at all: a quick retry is a duplicate", async () => {
    const clock = { now: new Date(t(0)) };
    const db = fakeDb(clock);
    await appendBridgeMessages(db as never, "L1", [user("אני מאילת")], clock.now);
    clock.now = new Date(t(20));
    expect(await appendBridgeMessages(db as never, "L1", [user("אני מאילת")], clock.now)).toBe(0);
  });

  it("…but the same words much later are a new message", async () => {
    const clock = { now: new Date(t(0)) };
    const db = fakeDb(clock);
    await appendBridgeMessages(db as never, "L1", [user("תודה")], clock.now);
    clock.now = new Date(Date.UTC(2026, 9, 1, 11, 0, 0));
    expect(await appendBridgeMessages(db as never, "L1", [user("תודה")], clock.now)).toBe(1);
  });

  it("two bot messages with the same text but different ids are both kept", async () => {
    const db = fakeDb({ now: new Date(t(10)) });
    await appendBridgeMessages(db as never, "L1", [bot("מעולה!", "wamid.A", t(1)), bot("מעולה!", "wamid.B", t(1))]);
    expect(db.messages).toHaveLength(2);
  });

  it("a bot message stored before it had an id gets the id attached, not a second row", async () => {
    const db = fakeDb({ now: new Date(t(10)) });
    db.messages.push({ id: "old", lead_id: "L1", role: "assistant", content: "היי!", provider_msg_id: null, created_at: t(1) });
    expect(await appendBridgeMessages(db as never, "L1", [bot("היי!", "wamid.H", t(1))])).toBe(0);
    expect(db.messages).toHaveLength(1);
    expect(db.messages[0]).toMatchObject({ provider_msg_id: "wamid.H", delivery_status: "sent" });
  });

  it("stores the candidate's message id when גובגט sends one", async () => {
    const db = fakeDb({ now: new Date(t(10)) });
    await appendBridgeMessages(db as never, "L1", [{ role: "user", content: "כן", providerMsgId: "wamid.U", createdAt: null }]);
    expect(db.messages[0]).toMatchObject({ provider_msg_id: "wamid.U" });
    expect(db.messages[0]).not.toHaveProperty("delivery_status");
  });
});

describe("appendBridgeMessages — a recruiter's message sent through the bot's number", () => {
  // send-manual saves it as the recruiter's, with no number and no id; גובגט
  // sends it and reports it back as a bot message, now with an id.
  const viaBot = (id: string, content: string, at: string) => ({
    id,
    lead_id: "L1",
    role: "recruiter",
    content,
    sent_by: "tami@eilatjobs.com",
    via_instance: null,
    provider_msg_id: null,
    created_at: at,
  });

  it("the echo is the same message: the id goes on Tami's row, no second \"AI\" row", async () => {
    // תמי, 05.10 12:28 — "היי סמי מה שלומך?" showed twice
    const db = fakeDb({ now: new Date(t(19)) });
    db.messages.push(viaBot("r1", "היי סמי מה שלומך?", t(0)));
    expect(await appendBridgeMessages(db as never, "L1", [bot("היי סמי מה שלומך?", "wamid.S1", t(19))])).toBe(0);
    expect(db.messages).toHaveLength(1);
    expect(db.messages[0]).toMatchObject({ id: "r1", role: "recruiter", provider_msg_id: "wamid.S1", delivery_status: "sent" });
  });

  it("a resend of that echo adds nothing either", async () => {
    const db = fakeDb({ now: new Date(t(30)) });
    db.messages.push(viaBot("r1", "בוא נדבר", t(0)));
    const payload = [bot("בוא נדבר", "wamid.S2", t(19))];
    await appendBridgeMessages(db as never, "L1", payload);
    expect(await appendBridgeMessages(db as never, "L1", payload)).toBe(0);
    expect(db.messages).toHaveLength(1);
  });

  it("the same words sent twice: each echo finds its own row", async () => {
    const db = fakeDb({ now: new Date(t(50)) });
    db.messages.push(viaBot("r1", "תודה", t(0)), viaBot("r2", "תודה", t(30)));
    await appendBridgeMessages(db as never, "L1", [bot("תודה", "wamid.A", t(5))]);
    await appendBridgeMessages(db as never, "L1", [bot("תודה", "wamid.B", t(35))]);
    expect(db.messages.map((m) => [m.id, m.provider_msg_id])).toEqual([
      ["r1", "wamid.A"],
      ["r2", "wamid.B"],
    ]);
  });

  it("a message Tami sent from her own number is not the bot's — the bot's own line is kept", async () => {
    const db = fakeDb({ now: new Date(t(20)) });
    db.messages.push({ ...viaBot("r1", "מעולה!", t(0)), via_instance: "710322717146" });
    expect(await appendBridgeMessages(db as never, "L1", [bot("מעולה!", "wamid.C", t(10))])).toBe(1);
  });

  it("long after, the same words from the bot are the bot's own", async () => {
    const db = fakeDb({ now: new Date(Date.UTC(2026, 9, 1, 11, 0, 0)) });
    db.messages.push(viaBot("r1", "מעולה!", t(0)));
    const later = new Date(Date.UTC(2026, 9, 1, 11, 0, 0)).toISOString();
    expect(await appendBridgeMessages(db as never, "L1", [bot("מעולה!", "wamid.D", later)])).toBe(1);
  });
});

describe("sameSlot", () => {
  it("matches the stored wall-clock value against גובגט's naive time", () => {
    expect(sameSlot("2026-10-05T10:00:00+00:00", "2026-10-05T10:00")).toBe(true);
    expect(sameSlot("2026-10-05 10:00:00+00", "2026-10-05T10:00:00")).toBe(true);
  });
  it("a different time or no stored slot is a different slot", () => {
    expect(sameSlot("2026-10-05T10:00:00+00:00", "2026-10-05T11:30")).toBe(false);
    expect(sameSlot(null, "2026-10-05T10:00")).toBe(false);
  });
});

describe("slotLabel", () => {
  it("reads as an Israeli date and time", () => {
    expect(slotLabel("2026-10-05T09:30")).toBe("05.10.2026 09:30");
  });
});

describe("noteOnce", () => {
  it("writes a note the first time only", async () => {
    const db = fakeDb({ now: new Date(t(0)) });
    await noteOnce(db as never, "L1", "gubget@eilatjobs.com", "גובגט דיווח על ראיון");
    await noteOnce(db as never, "L1", "gubget@eilatjobs.com", "גובגט דיווח על ראיון");
    expect(db.events).toHaveLength(1);
    expect(db.events[0]).toMatchObject({ lead_id: "L1", event_type: "גובגט", created_by: "gubget@eilatjobs.com" });
  });
});
