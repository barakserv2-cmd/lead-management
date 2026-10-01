import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

const rpc = vi.fn<(fn: string, params: unknown) => Promise<{ error: null }>>(async () => ({ error: null }));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ rpc }) }));

type AlertResult = { sent: boolean; via?: string; error?: string };
const alertAdmin = vi.fn<(...a: unknown[]) => Promise<AlertResult>>(async () => ({ sent: true, via: "test" }));
vi.mock("@/lib/adminAlert", () => ({ alertAdmin: (...a: unknown[]) => alertAdmin(...a) }));

let quiet = false;
vi.mock("@/lib/sendGate", () => ({ isQuietTimeNow: () => quiet }));

let backlog: { count: number; oldestMinutes: number; lastError: string | null } | null = null;
vi.mock("@/lib/machineBridge", () => ({ pushBacklog: async () => backlog }));

import {
  JOB_RULES,
  jobProblem,
  outageOf,
  problemHint,
  runWatchdog,
  withHeartbeat,
  type HeartbeatRow,
} from "./jobHealth";

const NOW = new Date("2026-10-01T10:00:00Z");
const minsAgo = (m: number) => new Date(NOW.getTime() - m * 60_000).toISOString();
const row = (over: Partial<HeartbeatRow> = {}): HeartbeatRow => ({
  job: "gmail",
  last_run_at: minsAgo(1),
  last_ok_at: minsAgo(1),
  last_error: null,
  consecutive_failures: 0,
  alert_open_since: null,
  ...over,
});

beforeEach(() => {
  rpc.mockClear();
  alertAdmin.mockClear();
  alertAdmin.mockImplementation(async () => ({ sent: true, via: "test" }));
  quiet = false;
  backlog = null;
});

describe("withHeartbeat", () => {
  const req = {} as never;
  const recorded = () => rpc.mock.calls.map((c) => c[1]);

  it("records a success", async () => {
    await withHeartbeat("gmail", async () => NextResponse.json({ ok: true }))(req);
    expect(recorded()).toEqual([{ p_job: "gmail", p_ok: true, p_error: null }]);
  });

  it("records ok:false with its error, even on 200", async () => {
    await withHeartbeat("daily", async () => NextResponse.json({ ok: false, error: "reminders down" }))(req);
    expect(recorded()).toEqual([{ p_job: "daily", p_ok: false, p_error: "reminders down" }]);
  });

  it("records a 500 without a JSON error by its status", async () => {
    await withHeartbeat("x", async () => new Response("boom", { status: 500 }))(req);
    expect(recorded()).toEqual([{ p_job: "x", p_ok: false, p_error: "HTTP 500" }]);
  });

  it("turns a throw into a recorded failure and a 500", async () => {
    const res = await withHeartbeat("gmail", async () => {
      throw new Error("invalid_grant");
    })(req);
    expect(res.status).toBe(500);
    expect(recorded()).toEqual([{ p_job: "gmail", p_ok: false, p_error: "invalid_grant" }]);
  });

  it("does not record a 401 — a stranger's request is not a run", async () => {
    await withHeartbeat("gmail", async () => NextResponse.json({ ok: false }, { status: 401 }))(req);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("passes the response through untouched", async () => {
    const res = await withHeartbeat("gmail", async () => NextResponse.json({ ok: true, n: 3 }))(req);
    expect(await res.json()).toEqual({ ok: true, n: 3 });
  });

  it("a failed record never breaks the job", async () => {
    rpc.mockImplementationOnce(async () => {
      throw new Error("db down");
    });
    const res = await withHeartbeat("gmail", async () => NextResponse.json({ ok: true }))(req);
    expect(res.status).toBe(200);
  });
});

describe("jobProblem", () => {
  const gmail = JOB_RULES.gmail;

  it("healthy job → null", () => {
    expect(jobProblem(row(), gmail, NOW)).toBeNull();
  });

  it("too many failures in a row", () => {
    const p = jobProblem(row({ consecutive_failures: 5, last_error: "invalid_grant" }), gmail, NOW);
    expect(p).toContain("5 פעמים ברצף");
    expect(p).toContain("invalid_grant");
  });

  it("a few failures is not yet a problem", () => {
    expect(jobProblem(row({ consecutive_failures: 2, last_ok_at: minsAgo(5) }), gmail, NOW)).toBeNull();
  });

  it("no success for longer than the rule → stale", () => {
    expect(jobProblem(row({ last_ok_at: minsAgo(25) }), gmail, NOW)).toContain("25 דקות");
    expect(jobProblem(row({ last_ok_at: minsAgo(180) }), gmail, NOW)).toContain("3 שעות");
  });

  it("never succeeded and below the failure threshold → wait", () => {
    expect(jobProblem(row({ last_ok_at: null, consecutive_failures: 1 }), gmail, NOW)).toBeNull();
  });
});

describe("problemHint", () => {
  it("expired Gmail connection", () => {
    expect(problemHint("gmail", "נכשלה — invalid_grant")).toContain("לחבר מחדש");
    expect(problemHint("gmail", "No Gmail credentials configured. Connect Gmail in Settings.")).toContain("לחבר מחדש");
  });
  it("deleted GreenAPI instance", () => {
    expect(problemHint("daily", "Instance is deleted")).toContain("GreenAPI");
  });
  it("bridge not configured", () => {
    expect(problemHint("sync-new-leads", "machine bridge not configured")).toContain("MACHINE_INGEST_URL");
  });
  it("nothing to add", () => {
    expect(problemHint("daily", "something else")).toBe("");
  });
});

describe("outageOf", () => {
  const r = (rule: string, succeeded: number, failed: number, details: string[] = []) => ({
    rule,
    attempted: succeeded + failed,
    succeeded,
    failed,
    details,
  });

  it("every send in a rule failed → outage, with the first failure", () => {
    const out = outageOf([r("interview_reminders", 0, 7, ["כשל: דנה — Instance is deleted"]), r("digest", 1, 0)]);
    expect(out).toContain("interview_reminders: 7 נכשלו");
    expect(out).toContain("Instance is deleted");
  });

  it("some failed, some sent → a bad number, not an outage", () => {
    expect(outageOf([r("interview_reminders", 6, 1)])).toBeNull();
  });

  it("nothing attempted → fine", () => {
    expect(outageOf([r("interview_reminders", 0, 0)])).toBeNull();
  });
});

// ── the watchdog, against an in-memory job_heartbeats ──────────

type Row = HeartbeatRow & Record<string, unknown>;

function fakeDb(rows: HeartbeatRow[]) {
  const table = new Map<string, Row>(rows.map((r) => [r.job, { ...r } as Row]));
  return {
    table,
    from() {
      return {
        select: async () => ({ data: [...table.values()], error: null }),
        upsert: async (v: { job: string }) => {
          if (!table.has(v.job)) table.set(v.job, { job: v.job, alert_open_since: null } as Row);
          return { error: null };
        },
        update(patch: Record<string, unknown>) {
          const filters: ((r: Row) => boolean)[] = [];
          const apply = () => {
            const hit = [...table.values()].filter((r) => filters.every((f) => f(r)));
            for (const r of hit) Object.assign(r, patch);
            return hit.map((r) => ({ job: r.job }));
          };
          const q = {
            eq: (col: string, v: unknown) => (filters.push((r) => r[col] === v), q),
            is: (col: string, v: unknown) => (filters.push((r) => (r[col] ?? null) === v), q),
            not: (col: string) => (filters.push((r) => r[col] != null), q),
            select: async () => ({ data: apply() }),
            then: (res: (v: unknown) => void) => res({ data: apply(), error: null }),
          };
          return q;
        },
      };
    },
  };
}

describe("runWatchdog", () => {
  const broken = () =>
    row({ job: "gmail", last_ok_at: minsAgo(60 * 24), consecutive_failures: 9, last_error: "invalid_grant" });

  it("alerts once per incident", async () => {
    const db = fakeDb([broken()]);
    const first = await runWatchdog(db as never);
    expect(first.opened).toEqual(["gmail"]);
    expect(alertAdmin).toHaveBeenCalledTimes(1);
    const alert = alertAdmin.mock.calls[0][0] as { text: string };
    expect(alert.text).toContain("⚠️ תקלה במערכת");
    expect(alert.text).toContain("לחבר מחדש");

    const second = await runWatchdog(db as never);
    expect(second.opened).toEqual([]);
    expect(alertAdmin).toHaveBeenCalledTimes(1);
  });

  it("announces the recovery, then stays quiet", async () => {
    const db = fakeDb([row({ job: "gmail", alert_open_since: minsAgo(30) })]);
    const res = await runWatchdog(db as never);
    expect(res.closed).toEqual(["gmail"]);
    expect((alertAdmin.mock.calls[0][0] as { text: string }).text).toContain("✅ חזר לעבוד");
    expect(db.table.get("gmail")!.alert_open_since).toBeNull();
  });

  it("holds new alerts at night / on Shabbat, and sends them after", async () => {
    quiet = true;
    const db = fakeDb([broken()]);
    const night = await runWatchdog(db as never);
    expect(night.held).toEqual(["gmail"]);
    expect(alertAdmin).not.toHaveBeenCalled();

    quiet = false;
    const morning = await runWatchdog(db as never);
    expect(morning.opened).toEqual(["gmail"]);
  });

  it("an alert that didn't go out leaves the incident closed, to retry", async () => {
    alertAdmin.mockImplementation(async () => ({ sent: false, via: "", error: "all channels down" }));
    const db = fakeDb([broken()]);
    const res = await runWatchdog(db as never);
    expect(res.opened).toEqual([]);
    expect(db.table.get("gmail")!.alert_open_since).toBeNull();
  });

  it("a job that never ran is not checked (fresh deploy)", async () => {
    const res = await runWatchdog(fakeDb([]) as never);
    expect(res.checked).toBe(0);
    expect(alertAdmin).not.toHaveBeenCalled();
  });

  it("leads stuck on the way to גובגט → alert, sent via GreenAPI first", async () => {
    backlog = { count: 4, oldestMinutes: 25, lastError: "timeout (5s)" };
    const db = fakeDb([]);
    const res = await runWatchdog(db as never);
    expect(res.opened).toEqual(["gubget-push-backlog"]);
    const [alert, opts] = alertAdmin.mock.calls[0] as [{ text: string }, { gubgetLast: boolean }];
    expect(alert.text).toContain("4 לידים לא הגיעו לגובגט");
    expect(opts.gubgetLast).toBe(true);
  });
});
