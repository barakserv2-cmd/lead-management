import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── a fake leads table keyed by phone and meta_lead_id ───────────────
type Row = Record<string, unknown>;
let rows: Row[];
let insertError: { code: string; message: string } | null;
let raceRow: Row | null; // appears only after a failed insert (concurrent write)
const rpcCalls: { fn: string; args: Record<string, unknown> }[] = [];
const pushed: string[] = [];
const welcomed: string[] = [];

function leadsQuery() {
  const filters: [string, unknown][] = [];
  const q = {
    select: () => q,
    eq: (col: string, val: unknown) => {
      filters.push([col, val]);
      return q;
    },
    limit: () => q,
    maybeSingle: async () => ({
      data: rows.find((r) => filters.every(([c, v]) => r[c] === v)) ?? null,
      error: null,
    }),
    insert: (row: Row) => ({
      select: () => ({
        single: async () => {
          if (insertError) {
            if (raceRow) rows.push(raceRow);
            return { data: null, error: insertError };
          }
          const saved = { id: `lead-${rows.length + 1}`, ...row };
          rows.push(saved);
          return { data: { id: saved.id, source: row.source }, error: null };
        },
      }),
    }),
  };
  return q;
}

vi.mock("@/lib/api-auth", () => ({
  getSupabaseAdmin: () => ({
    from: () => leadsQuery(),
    rpc: async (fn: string, args: Record<string, unknown>) => {
      rpcCalls.push({ fn, args });
      return { data: 1, error: null };
    },
  }),
}));
vi.mock("@/lib/machineBridge", () => ({
  pushLeadToMachine: async (_db: unknown, l: { id: string }) => {
    pushed.push(l.id);
    return { kind: "pushed" };
  },
}));
vi.mock("@/lib/whatsappWelcome", () => ({
  enqueueWelcome: async (id: string) => {
    welcomed.push(id);
  },
}));

import { POST } from "./route";

const KEY = "test-key";
const lead = {
  leadgen_id: "L1",
  campaign_name: "פיילוט מלונות אילת",
  ad_id: "A1",
  ad_name: "מתחילים השבוע",
  field_data: [
    { name: "full_name", values: ["דנה כהן"] },
    { name: "phone_number", values: ["+972501234567"] },
    { name: "over_18", values: ["כן"] },
    { name: "weekends", values: ["כן"] },
    { name: "availability", values: ["1–3 חודשים"] },
    { name: "arrival", values: ["השבוע"] },
    { name: "eilat_ok", values: ["כן"] },
  ],
};

function req(body: unknown, key: string | null = KEY) {
  return new NextRequest("http://localhost/api/leads/meta", {
    method: "POST",
    headers: { "content-type": "application/json", ...(key ? { "x-meta-lead-key": key } : {}) },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  process.env.META_LEAD_INGEST_KEY = KEY;
  rows = [];
  insertError = null;
  raceRow = null;
  rpcCalls.length = 0;
  pushed.length = 0;
  welcomed.length = 0;
});

describe("POST /api/leads/meta", () => {
  it("creates a lead with attribution and screening, then hands it to the bot", async () => {
    const res = await POST(req(lead));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json).toMatchObject({ result: "created", screening_passed: true });
    expect(rows[0]).toMatchObject({
      phone: "0501234567",
      channel: "פייסבוק ממומן",
      source: "פייסבוק - פיילוט מלונות אילת",
      campaign: "פיילוט מלונות אילת",
      meta_lead_id: "L1",
      meta_ad_id: "A1",
      screening_passed: true,
      status: "NEW_LEAD",
    });
    expect(pushed).toEqual([json.lead_id]);
    expect(welcomed).toEqual([json.lead_id]);
  });

  it("does not create a second card when the same Meta lead arrives twice", async () => {
    await POST(req(lead));
    const res = await POST(req(lead));
    expect((await res.json()).result).toBe("duplicate");
    expect(rows).toHaveLength(1);
    expect(rpcCalls).toHaveLength(0);
  });

  it("records a repeat inquiry when the phone already has a card", async () => {
    rows.push({ id: "old", phone: "0501234567" });
    const res = await POST(req({ ...lead, leadgen_id: "L2" }));
    expect(await res.json()).toEqual({ result: "repeat", lead_id: "old" });
    expect(rows).toHaveLength(1);
    expect(rpcCalls[0]).toMatchObject({
      fn: "record_repeat_inquiry",
      args: { p_lead_id: "old", p_channel: "פייסבוק ממומן", p_occurrence_key: "meta:L2" },
    });
    expect(pushed).toHaveLength(0);
  });

  it("resolves a concurrent insert of the same phone as a repeat", async () => {
    insertError = { code: "23505", message: "duplicate key value violates unique constraint leads_phone_key" };
    raceRow = { id: "winner", phone: "0501234567" };
    const res = await POST(req(lead));
    expect(await res.json()).toEqual({ result: "repeat", lead_id: "winner" });
  });

  it("stores a lead that fails screening, marked as not passed", async () => {
    const failing = {
      ...lead,
      field_data: lead.field_data.map((f) => (f.name === "weekends" ? { ...f, values: ["לא"] } : f)),
    };
    const res = await POST(req(failing));
    expect((await res.json()).screening_passed).toBe(false);
    expect(String(rows[0].notes)).toContain("סופי שבוע: לא ✗");
  });

  it("rejects a missing or wrong key, and works closed when the key is unset", async () => {
    expect((await POST(req(lead, null))).status).toBe(401);
    expect((await POST(req(lead, "wrong"))).status).toBe(401);
    delete process.env.META_LEAD_INGEST_KEY;
    expect((await POST(req(lead))).status).toBe(401);
    expect(rows).toHaveLength(0);
  });

  it("rejects bad input without writing", async () => {
    expect((await POST(req("{not json"))).status).toBe(400);
    expect((await POST(req({ leadgen_id: "L9" }))).status).toBe(400);
    expect(rows).toHaveLength(0);
  });

  it("returns 500 so Make retries when the database fails", async () => {
    insertError = { code: "08006", message: "connection failure" };
    const res = await POST(req(lead));
    expect(res.status).toBe(500);
  });
});
