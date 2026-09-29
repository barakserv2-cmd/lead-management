import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Fake Supabase client: who is signed in, and what is_recruiter() answers.
const state: {
  user: { email: string } | null;
  rpc: { data: unknown; error: { message: string } | null };
} = { user: null, rpc: { data: null, error: null } };

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: { getUser: async () => ({ data: { user: state.user } }) },
    rpc: async () => state.rpc,
  }),
}));

const { updateSession } = await import("./middleware");

const SESSION = "sb-pdeog-auth-token";

function req(path: string, method = "GET") {
  const r = new NextRequest(`https://crm.example${path}`, { method });
  r.cookies.set(SESSION, "jwt");
  r.cookies.set("other", "keep");
  return r;
}

/** Cookie header that the proxy forwards downstream (null = unchanged). */
function forwardedCookies(res: Response): string | null {
  return res.headers.get("x-middleware-request-cookie");
}

beforeEach(() => {
  state.user = { email: "rec@eilatjobs.com" };
  state.rpc = { data: true, error: null };
});

describe("proxy: recruiter check", () => {
  it("lets a recruiter through to dashboard pages", async () => {
    const res = await updateSession(req("/leads"));
    expect(res.headers.get("location")).toBeNull();
  });

  it("sends a signed-in non-recruiter to /login and clears the session cookie", async () => {
    state.rpc = { data: false, error: null };
    const res = await updateSession(req("/leads"));
    expect(res.headers.get("location")).toBe("https://crm.example/login");
    expect(res.headers.get("set-cookie") ?? "").toContain(`${SESSION}=;`);
  });

  it("strips a non-recruiter's session before API routes and server actions see it", async () => {
    state.rpc = { data: false, error: null };
    const res = await updateSession(req("/api/leads/search"));
    expect(res.headers.get("location")).toBeNull();
    const fwd = forwardedCookies(res) ?? "";
    expect(fwd).not.toContain(SESSION);
    expect(fwd).toContain("other=keep");
  });

  it("does not bounce a non-recruiter between /login and /dashboard", async () => {
    state.rpc = { data: false, error: null };
    const res = await updateSession(req("/login"));
    expect(res.headers.get("location")).toBeNull();
  });

  it("still redirects a recruiter on /login to the dashboard", async () => {
    const res = await updateSession(req("/login"));
    expect(res.headers.get("location")).toBe("https://crm.example/dashboard");
  });

  it("does not log everyone out when is_recruiter itself fails", async () => {
    state.rpc = { data: null, error: { message: "timeout" } };
    const res = await updateSession(req("/leads"));
    expect(res.headers.get("location")).toBeNull();
  });

  it("sends a visitor with no session to /login", async () => {
    state.user = null;
    const res = await updateSession(req("/leads"));
    expect(res.headers.get("location")).toBe("https://crm.example/login");
  });
});
