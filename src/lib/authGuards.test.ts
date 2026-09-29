// Every API route and every server action must check who is calling.
//
// The review committee (29/09) found 38 of 42 exported server actions with no
// auth check at all, and ~40 routes that accepted any Supabase session. Both
// are reachable by a plain POST, so a missing check is an open door. This test
// fails when a new route or action is added without one.

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";

const SRC = join(process.cwd(), "src");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const rel = (f: string) => relative(SRC, f).split("\\").join("/");

/** A route is guarded when it calls one of these (session, admin, cron, bridge, API key). */
const ROUTE_GUARD = /\b(getAuthedUser|requireAdmin|currentUser|hasCronSecret|hasMachineKey|validateApiKey)\(/;

/** Routes that are public on purpose, each with its own check. */
const PUBLIC_ROUTES: Record<string, string> = {
  "app/api/sign/[token]/route.ts": "candidate signing link — 192-bit token",
  "app/api/booking/[token]/route.ts": "candidate self-booking link — 192-bit token",
  "app/api/whatsapp/route.ts": "GreenAPI webhook — GREEN_API_WEBHOOK_TOKEN",
};

/** Server-action guards: requireRecruiter (api-auth) or the users page's admin check. */
const ACTION_GUARD = /\b(requireRecruiter|requireAdminActor)\(/;

const files = walk(SRC).filter((f) => /\.(ts|tsx)$/.test(f));

describe("API routes", () => {
  const routes = files.filter((f) => rel(f).startsWith("app/api/") && f.endsWith("route.ts"));

  it("finds the routes", () => {
    expect(routes.length).toBeGreaterThan(50);
  });

  for (const f of routes) {
    const name = rel(f);
    it(`${name} checks the caller`, () => {
      if (PUBLIC_ROUTES[name]) return;
      expect(readFileSync(f, "utf8"), `${name} has no auth check`).toMatch(ROUTE_GUARD);
    });
  }
});

describe("server actions", () => {
  const actionFiles = files.filter((f) => /^\s*["']use server["'];/.test(readFileSync(f, "utf8")));

  it("finds the action files", () => {
    expect(actionFiles.length).toBeGreaterThan(5);
  });

  for (const f of actionFiles) {
    const src = readFileSync(f, "utf8");
    const exports = [...src.matchAll(/^export async function (\w+)/gm)];
    for (let i = 0; i < exports.length; i++) {
      const start = exports[i].index!;
      const end = i + 1 < exports.length ? exports[i + 1].index! : src.length;
      const body = src.slice(start, end);
      it(`${rel(f)} › ${exports[i][1]} checks the caller`, () => {
        expect(body, `${exports[i][1]} in ${rel(f)} has no auth check`).toMatch(ACTION_GUARD);
      });
    }
  }

  it("changeLeadStatus is not a server action (callers choose the actor)", () => {
    const src = readFileSync(join(SRC, "lib/actions/changeLeadStatus.ts"), "utf8");
    expect(src).not.toMatch(/^\s*["']use server["'];/);
  });
});
