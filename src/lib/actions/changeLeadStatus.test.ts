import { describe, it, expect, vi, beforeEach } from "vitest";

// ── a fake Supabase that records what the action writes ─────────────
type Lead = Record<string, unknown>;
let lead: Lead;
let rpcResult: { data: unknown; error: { message: string } | null };
const rpcCalls: { fn: string; args: Record<string, unknown> }[] = [];
const updates: { table: string; patch: Record<string, unknown> }[] = [];
const inserts: { table: string; rows: unknown }[] = [];

function builder(table: string) {
  const q: Record<string, unknown> = {};
  const chain = () => q;
  Object.assign(q, {
    select: chain,
    eq: chain,
    in: chain,
    single: async () => ({ data: table === "leads" ? lead : null, error: null }),
    maybeSingle: async () => ({ data: table === "leads" ? lead : null, error: null }),
    update: (patch: Record<string, unknown>) => {
      updates.push({ table, patch });
      return { eq: async () => ({ error: null }), in: async () => ({ error: null }) };
    },
    insert: (rows: unknown) => {
      inserts.push({ table, rows });
      return Promise.resolve({ error: null });
    },
  });
  return q;
}

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: (table: string) => builder(table),
    rpc: async (fn: string, args: Record<string, unknown>) => {
      rpcCalls.push({ fn, args });
      return rpcResult;
    },
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@/lib/audit", () => ({ logAudit: async () => undefined }));
vi.mock("@/lib/machineBridge", () => ({ setMachineConversationMode: async () => true }));
vi.mock("@/lib/reminders", () => ({
  completeLeadReminders: async () => undefined,
  REMINDER_CLEARING_STATUSES: new Set<string>(),
}));
vi.mock("@/lib/employerNormalization", () => ({ normalizeEmployerName: async (n: string) => ({ normalized: n }) }));

import { changeLeadStatus, BOT_PAUSED_ERROR, CONFLICT_ERROR } from "./changeLeadStatus";

const GUBGET = "gubget@eilatjobs.com";

beforeEach(() => {
  lead = {
    status: "CONTACTED",
    screening_score: null,
    human_approval: false,
    interview_date: "2026-10-05T10:00:00+00:00",
    phone: "0501234567",
    handled_by: null,
    bot_paused: false,
  };
  rpcResult = { data: true, error: null };
  rpcCalls.length = 0;
  updates.length = 0;
  inserts.length = 0;
});

describe("a recruiter's freeze stops automated moves", () => {
  it("גובגט cannot move a lead a recruiter froze", async () => {
    lead.bot_paused = true;
    const res = await changeLeadStatus({ leadId: "L1", newStatus: "INTERVIEW_BOOKED", userId: GUBGET });
    expect(res).toEqual({ success: false, error: BOT_PAUSED_ERROR, reason: "bot_paused" });
    expect(rpcCalls).toEqual([]);
  });

  it("neither can the legacy bot", async () => {
    lead.bot_paused = true;
    const res = await changeLeadStatus({ leadId: "L1", newStatus: "SCREENING_IN_PROGRESS", userId: "ai-recruiter" });
    expect(res.reason).toBe("bot_paused");
  });

  it("a recruiter still can", async () => {
    lead.bot_paused = true;
    const res = await changeLeadStatus({ leadId: "L1", newStatus: "LOST_CONTACT", userId: "tami@eilatjobs.com" });
    expect(res.success).toBe(true);
    expect(rpcCalls).toHaveLength(1);
  });

  it("גובגט can move a lead nobody froze", async () => {
    const res = await changeLeadStatus({ leadId: "L1", newStatus: "INTERVIEW_BOOKED", userId: GUBGET });
    expect(res.success).toBe(true);
  });
});

describe("one atomic step", () => {
  it("writes the status and its history through transition_lead_status, guarded on the old status", async () => {
    await changeLeadStatus({ leadId: "L1", newStatus: "LOST_CONTACT", userId: "tami@eilatjobs.com", notes: "אין מענה" });
    expect(rpcCalls).toHaveLength(1);
    const { fn, args } = rpcCalls[0];
    expect(fn).toBe("transition_lead_status");
    expect(args).toMatchObject({ p_lead_id: "L1", p_from: "CONTACTED", p_changed_by: "tami@eilatjobs.com", p_notes: "אין מענה" });
    expect((args.p_patch as Record<string, unknown>).status).toBe("LOST_CONTACT");
    // no separate history insert or plain status update any more
    expect(inserts.filter((i) => i.table === "lead_status_history")).toEqual([]);
    expect(updates.filter((u) => u.table === "leads" && "status" in u.patch)).toEqual([]);
  });

  it("someone else moved it first → conflict, not a silent overwrite", async () => {
    rpcResult = { data: false, error: null };
    const res = await changeLeadStatus({ leadId: "L1", newStatus: "LOST_CONTACT", userId: "tami@eilatjobs.com" });
    expect(res).toEqual({ success: false, error: CONFLICT_ERROR, reason: "conflict" });
  });

  it("a database error is reported", async () => {
    rpcResult = { data: null, error: { message: "boom" } };
    const res = await changeLeadStatus({ leadId: "L1", newStatus: "LOST_CONTACT", userId: "tami@eilatjobs.com" });
    expect(res).toMatchObject({ success: false, reason: "db" });
  });

  it("an invalid move never reaches the database", async () => {
    const res = await changeLeadStatus({ leadId: "L1", newStatus: "STARTED", userId: "tami@eilatjobs.com" });
    expect(res.reason).toBe("invalid");
    expect(rpcCalls).toEqual([]);
  });
});

describe("sub-status travels with the status", () => {
  it("in the same patch", async () => {
    lead.status = "NEW_LEAD";
    await changeLeadStatus({
      leadId: "L1",
      newStatus: "CONTACTED",
      userId: "tami@eilatjobs.com",
      extra: { subStatus: "אין מענה 1" },
    });
    const patch = rpcCalls[0].args.p_patch as Record<string, unknown>;
    expect(patch.sub_status).toBe("אין מענה 1");
    expect(patch.sub_status_at).toBeTruthy();
  });

  it("a plain move still clears it", async () => {
    await changeLeadStatus({ leadId: "L1", newStatus: "LOST_CONTACT", userId: "tami@eilatjobs.com" });
    const patch = rpcCalls[0].args.p_patch as Record<string, unknown>;
    expect(patch.sub_status).toBeNull();
    expect(patch.sub_status_at).toBeNull();
  });

  it("same status, new sub-status (another unanswered call) → writes just that", async () => {
    const res = await changeLeadStatus({
      leadId: "L1",
      newStatus: "CONTACTED",
      userId: "tami@eilatjobs.com",
      extra: { subStatus: "אין מענה 2" },
    });
    expect(res.success).toBe(true);
    expect(rpcCalls).toEqual([]);
    expect(updates).toHaveLength(1);
    expect(updates[0].patch).toMatchObject({ sub_status: "אין מענה 2" });
    expect(updates[0].patch.last_contact_at).toBeTruthy();
  });

  it("same status and no sub-status → nothing to do", async () => {
    const res = await changeLeadStatus({ leadId: "L1", newStatus: "CONTACTED", userId: "tami@eilatjobs.com" });
    expect(res.success).toBe(true);
    expect(rpcCalls).toEqual([]);
    expect(updates).toEqual([]);
  });
});

describe("ownership", () => {
  it("a machine move doesn't claim the lead or count as a conversation", async () => {
    await changeLeadStatus({ leadId: "L1", newStatus: "INTERVIEW_BOOKED", userId: GUBGET });
    const patch = rpcCalls[0].args.p_patch as Record<string, unknown>;
    expect(patch).not.toHaveProperty("handled_by");
    expect(patch).not.toHaveProperty("last_contact_at");
    expect(patch).not.toHaveProperty("bot_paused");
  });

  it("a recruiter's move freezes גובגט and takes an unowned lead", async () => {
    await changeLeadStatus({ leadId: "L1", newStatus: "LOST_CONTACT", userId: "tami@eilatjobs.com" });
    const patch = rpcCalls[0].args.p_patch as Record<string, unknown>;
    expect(patch).toMatchObject({ bot_paused: true, handled_by: "tami@eilatjobs.com" });
  });
});

describe("לא התחיל לעבוד — the reason is mandatory", () => {
  const MALI = "barakserv@eilatjobs.com";
  const patch = () => rpcCalls[0].args.p_patch as Record<string, unknown>;
  const journal = () =>
    inserts.filter((i) => i.table === "lead_events").flatMap((i) => i.rows as Record<string, unknown>[]);

  beforeEach(() => {
    lead.status = "HIRED";
  });

  it("no reason → refused, nothing written (a table click, a bulk move, the API)", async () => {
    const res = await changeLeadStatus({ leadId: "L1", newStatus: "NEVER_STARTED", userId: MALI });
    expect(res).toMatchObject({ success: false, reason: "invalid" });
    expect(rpcCalls).toEqual([]);
  });

  it("an unknown reason code is refused too", async () => {
    const res = await changeLeadStatus({
      leadId: "L1",
      newStatus: "NEVER_STARTED",
      userId: MALI,
      extra: { neverStartedReason: "whatever" },
    });
    expect(res.success).toBe(false);
  });

  it("\"אחר\" needs the details written out", async () => {
    const res = await changeLeadStatus({
      leadId: "L1",
      newStatus: "NEVER_STARTED",
      userId: MALI,
      extra: { neverStartedReason: "other", neverStartedNotes: "   " },
    });
    expect(res.success).toBe(false);
    expect(rpcCalls).toEqual([]);
  });

  it("with a reason: saved on the lead and in the journal", async () => {
    const res = await changeLeadStatus({
      leadId: "L1",
      newStatus: "NEVER_STARTED",
      userId: MALI,
      extra: { neverStartedReason: "found_other_job", neverStartedNotes: " עבר לאילתנים " },
    });
    expect(res.success).toBe(true);
    expect(patch()).toMatchObject({
      status: "NEVER_STARTED",
      never_started_reason: "found_other_job",
      never_started_notes: "עבר לאילתנים",
    });
    expect(patch()).not.toHaveProperty("employment_end_date");
    expect(journal()).toContainEqual(
      expect.objectContaining({ event_type: "לא התחיל לעבוד", event_text: "סיבה: מצא עבודה אחרת — עבר לאילתנים" })
    );
  });

  it("fixing a wrong \"סיום העסקה\": the end date and reason go away", async () => {
    lead.status = "EMPLOYMENT_ENDED";
    const res = await changeLeadStatus({
      leadId: "L1",
      newStatus: "NEVER_STARTED",
      userId: MALI,
      extra: { neverStartedReason: "unreachable" },
    });
    expect(res.success).toBe(true);
    expect(patch()).toMatchObject({
      never_started_notes: null,
      employment_end_date: null,
      employment_end_reason: null,
      employment_end_notes: null,
    });
  });

  it("only from a hire — not from someone who never got the job", async () => {
    lead.status = "ARRIVED";
    const res = await changeLeadStatus({
      leadId: "L1",
      newStatus: "NEVER_STARTED",
      userId: MALI,
      extra: { neverStartedReason: "changed_mind" },
    });
    expect(res).toMatchObject({ success: false, reason: "invalid" });
  });
});
