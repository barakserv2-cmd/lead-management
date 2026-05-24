import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@supabase/supabase-js";

// TEMPORARY diagnostic endpoint: mirrors createLead's exact supabase call and
// reports timings so we can isolate whether the production hang is in the
// client-build, the network round-trip, or the insert itself. Delete after.
export async function GET() {
  const log: Record<string, unknown> = { step: "start", t0: Date.now() };
  try {
    log.url_present = !!process.env.NEXT_PUBLIC_SUPABASE_URL;
    log.key_present = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
    log.key_len = process.env.SUPABASE_SERVICE_ROLE_KEY?.length ?? 0;

    const buildT0 = Date.now();
    const sb = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    log.client_built_ms = Date.now() - buildT0;

    const insertT0 = Date.now();
    const { data, error } = await sb
      .from("leads")
      .insert({
        name: "CLAUDE_DEBUG_PROD_DELETE",
        phone: `debug-${Date.now()}`,
        source: "אחר",
        status: "NEW_LEAD",
      })
      .select("id")
      .single();
    log.insert_ms = Date.now() - insertT0;
    log.insert_error = error?.message ?? null;
    log.inserted_id = data?.id ?? null;

    // Self-cleanup
    if (data?.id) {
      const delT0 = Date.now();
      await sb.from("leads").delete().eq("id", data.id);
      log.delete_ms = Date.now() - delT0;
    }

    log.total_ms = Date.now() - (log.t0 as number);
    return NextResponse.json(log);
  } catch (err) {
    log.threw = err instanceof Error ? err.message : String(err);
    log.total_ms = Date.now() - (log.t0 as number);
    return NextResponse.json(log, { status: 500 });
  }
}
