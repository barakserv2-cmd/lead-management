import { describe, it, expect, vi, beforeEach } from "vitest";

let profile: { role: string; sees_shared_chats?: boolean } | null = null;
let personal: { instanceId: string } | null = null;

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({ ilike: () => ({ maybeSingle: async () => ({ data: profile, error: null }) }) }),
    }),
  }),
}));
vi.mock("@/lib/whatsappService", () => ({ getAccountForEmail: async () => personal }));

import { getMessageScope, handlesLead, scopeFilter } from "./messageVisibility";

const MALI = "barakserv@eilatjobs.com";

beforeEach(() => {
  profile = { role: "מגייס" };
  personal = { instanceId: "710322726170" };
});

describe("getMessageScope", () => {
  it("a recruiter with a number sees shared conversations by default", async () => {
    const s = await getMessageScope("tami@eilatjobs.com");
    expect(s).toMatchObject({ all: false, instances: ["710322726170"], shared: true, canSend: true });
  });

  it("limited to her own when sees_shared_chats is off", async () => {
    profile = { role: "מגייס", sees_shared_chats: false };
    const s = await getMessageScope(MALI);
    expect(s).toMatchObject({ all: false, instances: ["710322726170"], shared: false, email: MALI });
  });

  it("an admin sees everything whatever the flag", async () => {
    profile = { role: "אדמין", sees_shared_chats: false };
    expect((await getMessageScope("saar@eilatjobs.com")).all).toBe(true);
  });

  it("no profile row → shared stays on (the flag only ever narrows)", async () => {
    profile = null;
    expect((await getMessageScope("x@eilatjobs.com")).shared).toBe(true);
  });
});

describe("scopeFilter", () => {
  const base = { all: false, instances: ["710322726170"], email: MALI, canSend: true, notify: true };

  it("shared: her number plus house conversations", () => {
    expect(scopeFilter({ ...base, shared: true })).toBe("via_instance.eq.710322726170,via_instance.is.null");
  });

  it("limited: only her number", () => {
    expect(scopeFilter({ ...base, shared: false })).toBe("via_instance.eq.710322726170");
  });

  it("limited, but on a lead she handles: גובגט's history too", () => {
    expect(scopeFilter({ ...base, shared: false }, { ownsLead: true })).toBe(
      "via_instance.eq.710322726170,via_instance.is.null"
    );
  });

  it("admin: no filter", () => {
    expect(scopeFilter({ ...base, all: true, shared: true })).toBeNull();
  });
});

describe("handlesLead", () => {
  const scope = { all: false, instances: [], email: MALI, canSend: true, notify: true, shared: false };
  it("matches the owner, ignoring case and spaces", () => {
    expect(handlesLead(scope, " BarakServ@eilatjobs.com ")).toBe(true);
  });
  it("another recruiter's lead, or no owner, is not hers", () => {
    expect(handlesLead(scope, "tami@eilatjobs.com")).toBe(false);
    expect(handlesLead(scope, null)).toBe(false);
  });
});
