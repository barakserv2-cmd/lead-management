import { NextRequest, NextResponse } from "next/server";
import { getGmailClient } from "@/lib/gmail";
import { getSupabaseAdmin } from "@/lib/api-auth";

// One-time backfill: existing email leads were stored without the email's send
// date, so they sort by ingestion time (wrong — old backlog emails float up).
// This reads each lead's real date from Gmail (by original_email_id) and fills
// email_date, which feeds the generated effective_at sort column.
//
// Call repeatedly until { remaining: 0 }:
//   curl -H "Authorization: Bearer $CRON_SECRET" .../api/gmail/backfill-dates
// Guarded by CRON_SECRET so it can't be hit anonymously.

export const maxDuration = 60;

const BATCH = 40; // Gmail gets per invocation
const CONCURRENCY = 8;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // local/curl when unset
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();

  // Leads that came from email but have no email_date yet.
  const { data: rows, error } = await supabase
    .from("leads")
    .select("id, original_email_id, created_at")
    .not("original_email_id", "is", null)
    .is("email_date", null)
    .limit(BATCH);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!rows || rows.length === 0) {
    return NextResponse.json({ processed: 0, updated: 0, remaining: 0, done: true });
  }

  const gmail = await getGmailClient();
  let updated = 0;
  let fallback = 0;

  async function processOne(row: { id: string; original_email_id: string; created_at: string }) {
    let iso: string;
    try {
      const msg = await gmail.users.messages.get({
        userId: "me",
        id: row.original_email_id,
        format: "metadata",
        metadataHeaders: ["Date"],
      });
      const internal = msg.data.internalDate; // epoch ms as string
      if (internal) {
        iso = new Date(Number(internal)).toISOString();
        updated++;
      } else {
        // Message exists but no date — keep prior ordering.
        iso = row.created_at;
        fallback++;
      }
    } catch {
      // Message deleted/unreachable — fall back to created_at so this row is
      // resolved and not retried on every run.
      iso = row.created_at;
      fallback++;
    }
    await supabase.from("leads").update({ email_date: iso }).eq("id", row.id);
  }

  // Bounded concurrency.
  for (let i = 0; i < rows.length; i += CONCURRENCY) {
    await Promise.all(rows.slice(i, i + CONCURRENCY).map(processOne));
  }

  const { count: remaining } = await supabase
    .from("leads")
    .select("id", { count: "exact", head: true })
    .not("original_email_id", "is", null)
    .is("email_date", null);

  return NextResponse.json({
    processed: rows.length,
    updated,
    fallback,
    remaining: remaining ?? 0,
    done: (remaining ?? 0) === 0,
  });
}
