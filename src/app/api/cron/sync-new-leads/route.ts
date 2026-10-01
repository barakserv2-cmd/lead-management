import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { hasCronSecret } from "@/lib/secrets";
import { runMachinePush } from "@/lib/machineBridge";
import { withHeartbeat } from "@/lib/jobHealth";

// Push EVERY new lead (any source) to גובגט so it's the first responder — not
// just AllJobs-email leads. Runs every minute over the outbox in
// lib/machineBridge.ts: a lead counts as pushed only after גובגט answers 2xx,
// and a failed push is retried with backoff for 3 days. גובגט de-dups (R-102),
// so a lead pushed more than once only ever gets one welcome. Guarded by
// CRON_SECRET.

export const maxDuration = 60;

function getAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export const GET = withHeartbeat("sync-new-leads", async (req: NextRequest) => {
  if (!hasCronSecret(req)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const run = await runMachinePush(getAdmin());
  return NextResponse.json(run, { status: run.ok || run.error === "machine bridge not configured" ? 200 : 500 });
});
