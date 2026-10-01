import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  isPermanentRejection,
  pushBackoffMinutes,
  pushLeadToMachine,
  pushSkipReason,
  runMachinePush,
  type MachinePushLead,
} from "./machineBridge";

const lead = (over: Partial<MachinePushLead> = {}): MachinePushLead => ({
  id: "L1",
  phone: "0501234567",
  name: "דנה",
  location: "אילת",
  source: "AllJobs",
  job_title: "קופאית",
  handled_by: null,
  do_not_contact: false,
  machine_push_attempts: 0,
  ...over,
});

/** Records every update(patch).eq("id", id) on leads; select() returns `pending`. */
function fakeDb(pending: MachinePushLead[] = []) {
  const updates: { id: string; patch: Record<string, unknown> }[] = [];
  const chain = {
    select: () => chain,
    is: () => chain,
    gte: () => chain,
    lte: () => chain,
    or: () => chain,
    order: () => chain,
    limit: async () => ({ data: pending, error: null }),
  };
  return {
    updates,
    from: () => ({
      ...chain,
      update: (patch: Record<string, unknown>) => ({
        eq: async (_col: string, id: string) => {
          updates.push({ id, patch });
          return { error: null };
        },
      }),
    }),
  };
}

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubEnv("MACHINE_INGEST_URL", "https://gubget.test");
  vi.stubEnv("MACHINE_INGEST_KEY", "k");
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("pushSkipReason", () => {
  it("a fresh lead with a phone is pushed", () => {
    expect(pushSkipReason(lead())).toBeNull();
  });
  it("no phone, or a placeholder phone", () => {
    expect(pushSkipReason(lead({ phone: null }))).toBe("no_phone");
    expect(pushSkipReason(lead({ phone: "no-phone-abc" }))).toBe("no_phone");
    expect(pushSkipReason(lead({ phone: "anon-123" }))).toBe("no_phone");
  });
  it("גובגט's own lead is not echoed back", () => {
    expect(pushSkipReason(lead({ source: "גובגט" }))).toBe("own_lead");
  });
  it("a recruiter already owns it", () => {
    expect(pushSkipReason(lead({ handled_by: "tami@eilatjobs.com" }))).toBe("owned");
  });
  it("owned by גובגט is not a reason to skip", () => {
    expect(pushSkipReason(lead({ handled_by: "Gubget@eilatjobs.com" }))).toBeNull();
  });
  it("do not contact", () => {
    expect(pushSkipReason(lead({ do_not_contact: true }))).toBe("dnc");
  });
});

describe("pushBackoffMinutes", () => {
  it("1, 2, 4 … capped at 30", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 20].map(pushBackoffMinutes)).toEqual([1, 2, 4, 8, 16, 30, 30, 30]);
  });
});

describe("isPermanentRejection", () => {
  it("a bad lead is not retried; a bad key or a down server is", () => {
    expect([400, 409, 422].every(isPermanentRejection)).toBe(true);
    expect([401, 403, 404, 429, 500, 502, 503].some(isPermanentRejection)).toBe(false);
  });
});

describe("pushLeadToMachine", () => {
  it("2xx → resolved as sent", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
    const db = fakeDb();
    expect(await pushLeadToMachine(db as never, lead())).toEqual({ kind: "sent" });
    expect(db.updates[0].patch).toMatchObject({ machine_push_note: "sent", machine_push_error: null });
    expect(db.updates[0].patch.machine_pushed_at).toBeTruthy();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://gubget.test/api/v1/leads");
    expect(JSON.parse(init.body)).toMatchObject({ phone: "0501234567", city: "אילת", campaign: "AllJobs" });
  });

  it("5xx → stays in the queue with a backoff", async () => {
    fetchMock.mockResolvedValue(new Response("down", { status: 503 }));
    const db = fakeDb();
    const out = await pushLeadToMachine(db as never, lead({ machine_push_attempts: 2 }));
    expect(out).toMatchObject({ kind: "failed" });
    const patch = db.updates[0].patch;
    expect(patch.machine_pushed_at).toBeUndefined();
    expect(patch.machine_push_attempts).toBe(3);
    expect(patch.machine_push_error).toContain("HTTP 503");
    const waitMin = (new Date(patch.machine_push_next_at as string).getTime() - Date.now()) / 60_000;
    expect(waitMin).toBeGreaterThan(3.9);
    expect(waitMin).toBeLessThan(4.1);
  });

  it("network error → stays in the queue", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));
    const db = fakeDb();
    expect(await pushLeadToMachine(db as never, lead())).toMatchObject({ kind: "failed", error: "ECONNREFUSED" });
    expect(db.updates[0].patch.machine_pushed_at).toBeUndefined();
  });

  it("400 → resolved as rejected, not retried forever", async () => {
    fetchMock.mockResolvedValue(new Response("bad phone", { status: 400 }));
    const db = fakeDb();
    expect(await pushLeadToMachine(db as never, lead())).toMatchObject({ kind: "rejected" });
    expect(db.updates[0].patch).toMatchObject({ machine_push_note: "rejected:400" });
    expect(db.updates[0].patch.machine_pushed_at).toBeTruthy();
  });

  it("skipped lead → resolved without calling גובגט", async () => {
    const db = fakeDb();
    expect(await pushLeadToMachine(db as never, lead({ handled_by: "tami@eilatjobs.com" }))).toEqual({
      kind: "skipped",
      reason: "owned",
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(db.updates[0].patch).toMatchObject({ machine_push_note: "skip:owned" });
  });

  it("bridge not configured → the lead is left untouched in the queue", async () => {
    vi.stubEnv("MACHINE_INGEST_URL", "");
    const db = fakeDb();
    expect(await pushLeadToMachine(db as never, lead())).toMatchObject({ kind: "failed" });
    expect(db.updates).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("runMachinePush", () => {
  it("pushes the queue and counts each outcome", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
    const db = fakeDb([lead({ id: "a" }), lead({ id: "b", phone: null }), lead({ id: "c" })]);
    const run = await runMachinePush(db as never);
    expect(run).toMatchObject({ ok: true, considered: 3, sent: 2, skipped: 1, failed: 0 });
  });

  it("stops after 3 failures in a row — גובגט is down, not 100 timeouts", async () => {
    fetchMock.mockRejectedValue(new Error("timeout"));
    const db = fakeDb(Array.from({ length: 10 }, (_, i) => lead({ id: `L${i}` })));
    const run = await runMachinePush(db as never);
    expect(run).toMatchObject({ ok: true, considered: 3, failed: 3, lastError: "timeout" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("not configured → the cron reports it (and the watchdog alerts)", async () => {
    vi.stubEnv("MACHINE_INGEST_KEY", "");
    const run = await runMachinePush(fakeDb([lead()]) as never);
    expect(run).toMatchObject({ ok: false, error: "machine bridge not configured" });
  });
});
