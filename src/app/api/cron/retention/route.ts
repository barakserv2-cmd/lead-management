import { NextRequest, NextResponse } from "next/server";
import { logAudit } from "@/lib/audit";
import {
  AUDIT_RETENTION_MONTHS,
  RETENTION_MONTHS,
  RETENTION_MONTHS_HIRED,
  anonymizeLead,
  privacyAdmin,
} from "@/lib/privacy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

// ── Weekly data-retention job (vercel.json: Sunday 04:00 UTC) ──
// צמצום מידע לפי חוק הגנת הפרטיות: לידים ללא פעילות 24 חודש (84 למי
// שהתקבל לעבודה) עוברים אנונימיזציה; רשומות audit_log מעל 24 חודש נמחקות.
//
//   GET /api/cron/retention              → run
//   GET /api/cron/retention?dry_run=1    → list what would be anonymized
//   GET /api/cron/retention?limit=100    → cap per run (default 500)
// Guarded by CRON_SECRET (same pattern as /api/cron/daily).

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // local dev
  const header = req.headers.get("authorization") ?? "";
  return header === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dryRun = req.nextUrl.searchParams.get("dry_run") === "1";
  const limit = Math.min(2000, Number(req.nextUrl.searchParams.get("limit") ?? 500) || 500);
  const admin = privacyAdmin();
  const startedAt = Date.now();

  // 1. find candidates
  const { data: candidates, error: findErr } = await admin.rpc("retention_candidates", {
    p_months: RETENTION_MONTHS,
    p_months_hired: RETENTION_MONTHS_HIRED,
    p_limit: limit,
  });
  if (findErr) {
    return NextResponse.json({ error: `retention_candidates: ${findErr.message}` }, { status: 500 });
  }
  const rows = (candidates ?? []) as { id: string; status: string; last_activity: string }[];

  if (dryRun) {
    return NextResponse.json({
      dry_run: true,
      policy: { months: RETENTION_MONTHS, months_hired: RETENTION_MONTHS_HIRED },
      would_anonymize: rows.length,
      sample: rows.slice(0, 50),
    });
  }

  // 2. anonymize one by one (storage purge + RPC); keep going on errors
  let done = 0;
  const failed: { id: string; error: string }[] = [];
  for (const row of rows) {
    const r = await anonymizeLead(row.id, "cron", { admin });
    if (r.ok) done++;
    else failed.push({ id: row.id, error: r.error ?? "unknown" });
  }

  // 3. purge old audit rows
  const { data: purged, error: purgeErr } = await admin.rpc("purge_audit_log", {
    p_months: AUDIT_RETENTION_MONTHS,
  });

  const summary = {
    ok: true,
    policy: { months: RETENTION_MONTHS, months_hired: RETENTION_MONTHS_HIRED, audit_months: AUDIT_RETENTION_MONTHS },
    candidates: rows.length,
    anonymized: done,
    failed,
    audit_rows_purged: purgeErr ? null : (purged as number),
    duration_ms: Date.now() - startedAt,
  };

  await logAudit({
    action: "anonymize",
    entity: "retention_run",
    actor: "cron",
    actorType: "cron",
    meta: summary,
  });

  return NextResponse.json(summary);
}

export const POST = GET;
