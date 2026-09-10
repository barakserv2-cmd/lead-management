import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { STATUS_LABELS, type LeadStatusValue } from "@/lib/stateMachine";
import { logAudit } from "@/lib/audit";
import { getSupabaseAdmin } from "@/lib/api-auth";

// יומן אירועים לליד: אירועים ידניים (lead_events) + שינויי סטטוס
// אוטומטיים (lead_status_history) ממוזגים לציר זמן אחד.
// fetch+API ולא server action — הדפוס הקבוע בפרויקט (Next 16).

export const GUBGET_EMAIL = "gubget@eilatjobs.com";
// PostgREST filter for "this row was not written by גובגט". `neq` alone drops
// rows where created_by IS NULL (NULL comparisons are never true), which would
// lock older system rows out of editing — hence the explicit null branch.
const NOT_GUBGET = `created_by.is.null,created_by.neq."${GUBGET_EMAIL}"`;

export interface TimelineEvent {
  id: string;
  kind: "event" | "status";
  event_type: string;
  text: string;
  created_by: string;
  /** Display name for created_by — a recruiter's name, "גובגט", or "מערכת". */
  author: string;
  /**
   * Who did this. The recruiters' complaint was that they could not tell the
   * bot's work from their own in the same journal — so the timeline says it
   * explicitly instead of leaving it to be inferred from an email address.
   */
  actor: "bot" | "human" | "system";
  created_at: string;
  editable?: boolean; // true only for manual journal entries (lead_events)
}

function classify(createdBy: string | null | undefined): { author: string; actor: TimelineEvent["actor"] } {
  const by = (createdBy ?? "").trim();
  if (!by || by === "מערכת" || by === "system") return { author: "מערכת", actor: "system" };
  if (by.toLowerCase() === GUBGET_EMAIL) return { author: "גובגט", actor: "bot" };
  return { author: by, actor: "human" };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: leadId } = await params;

  const [eventsRes, historyRes, interactionsRes] = await Promise.all([
    supabase
      .from("lead_events")
      .select("id, event_type, event_text, created_by, created_at")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("lead_status_history")
      .select("id, from_status, to_status, changed_by, changed_at, notes")
      .eq("lead_id", leadId)
      .order("changed_at", { ascending: false })
      .limit(200),
    supabase
      .from("interaction_logs")
      .select("id, type, outcome, notes, created_at")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false })
      .limit(200),
  ]);

  // הטבלה עוד לא קיימת עד שהמיגרציה תרוץ — מחזירים ציר זמן חלקי במקום 500
  const manual: TimelineEvent[] = (eventsRes.error ? [] : eventsRes.data ?? []).map((e) => ({
    id: e.id,
    kind: "event" as const,
    event_type: e.event_type,
    text: e.event_text,
    created_by: e.created_by || "מערכת",
    ...classify(e.created_by),
    created_at: e.created_at,
    // גובגט's own entries are a record of what the bot did — a recruiter may
    // not rewrite or erase them.
    editable: classify(e.created_by).actor === "human",
  }));

  const statusChanges: TimelineEvent[] = (historyRes.data ?? []).map((h) => ({
    id: h.id,
    kind: "status" as const,
    event_type: "שינוי סטטוס",
    text:
      `${STATUS_LABELS[h.from_status as LeadStatusValue] ?? h.from_status} ← ${STATUS_LABELS[h.to_status as LeadStatusValue] ?? h.to_status}` +
      (h.notes ? ` — ${h.notes}` : ""),
    created_by: h.changed_by ?? "מערכת",
    ...classify(h.changed_by),
    created_at: h.changed_at,
  }));

  const INTERACTION_TYPE_LABELS: Record<string, string> = {
    call_in: "שיחה נכנסת",
    call_out: "שיחה יוצאת",
    whatsapp: "וואטסאפ",
  };
  const INTERACTION_OUTCOME_LABELS: Record<string, string> = {
    request: "בקשה",
    complaint: "תלונה",
    update: "עדכון",
    other: "אחר",
  };

  const interactions: TimelineEvent[] = (interactionsRes.data ?? []).map((i) => ({
    id: i.id,
    kind: "event" as const,
    event_type: INTERACTION_TYPE_LABELS[i.type] ?? i.type,
    text:
      (INTERACTION_OUTCOME_LABELS[i.outcome] ? `${INTERACTION_OUTCOME_LABELS[i.outcome]}` : "") +
      (i.notes ? `${i.outcome ? " — " : ""}${i.notes}` : ""),
    created_by: "רכזת",
    author: "רכזת",
    actor: "human" as const,
    created_at: i.created_at,
  }));

  const timeline = [...manual, ...statusChanges, ...interactions].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  // Turn recruiter emails into the names the team actually uses. user_profiles
  // is readable only through the admin client (see 00088_rls_recruiters_only).
  const emails = [...new Set(timeline.filter((e) => e.actor === "human" && e.author.includes("@")).map((e) => e.author))];
  if (emails.length) {
    const { data: profiles } = await getSupabaseAdmin()
      .from("user_profiles")
      .select("email, name")
      .in("email", emails);
    const names = new Map((profiles ?? []).map((p) => [String(p.email).toLowerCase(), p.name as string | null]));
    for (const e of timeline) {
      const n = names.get(e.author.toLowerCase());
      if (n) e.author = n;
    }
  }

  return NextResponse.json({
    timeline,
    eventsTableMissing: !!eventsRes.error,
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: leadId } = await params;

  let body: { event_type?: string; event_text?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const text = body.event_text?.trim();
  if (!text) {
    return NextResponse.json({ error: "תוכן האירוע חובה" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("lead_events")
    .insert({
      lead_id: leadId,
      event_type: body.event_type?.trim() || "אחר",
      event_text: text,
      created_by: user.email ?? user.id,
    })
    .select("id, event_type, event_text, created_by, created_at")
    .single();

  if (error) {
    const missing = error.message.includes("lead_events");
    return NextResponse.json(
      { error: missing ? "טבלת האירועים עדיין לא הוקמה — יש להריץ את מיגרציה 00035" : error.message },
      { status: missing ? 503 : 500 }
    );
  }

  return NextResponse.json({ event: data });
}

// Edit an existing manual journal entry (lead_events only). Status-change and
// interaction rows are not editable here. The original author (created_by) is
// preserved so accountability isn't lost.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: leadId } = await params;

  let body: { event_id?: string; event_text?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const text = body.event_text?.trim();
  if (!body.event_id || !text) {
    return NextResponse.json({ error: "חסר מזהה אירוע או תוכן" }, { status: 400 });
  }

  // ל-lead_events יש RLS עם SELECT/INSERT בלבד — עדכון דרך לקוח המשתמש פשוט
  // לא נוגע בשום שורה. הרשאת המשתמש נבדקה למעלה והשיוך לליד נאכף כאן, אז
  // הכתיבה עוברת בשירות. עדיף מלפתוח UPDATE/DELETE גורף ל-authenticated.
  const { data, error } = await getSupabaseAdmin()
    .from("lead_events")
    .update({ event_text: text })
    .eq("id", body.event_id)
    .eq("lead_id", leadId) // guard: the event must belong to this lead
    .or(NOT_GUBGET) // guard: גובגט's own log is a record, not a draft
    .select("id, event_type, event_text, created_by, created_at")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "האירוע לא נמצא (רישום של גובגט אינו ניתן לעריכה)" }, { status: 404 });
  }

  return NextResponse.json({ event: data });
}

// Delete a manual journal entry (lead_events only). Status-change and
// interaction rows are built from other tables and are not deletable here.
// The row is gone, so the deletion itself is written to the audit log with
// the text it removed — otherwise a note could vanish without a trace.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: leadId } = await params;

  let body: { event_id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.event_id) {
    return NextResponse.json({ error: "חסר מזהה אירוע" }, { status: 400 });
  }

  // כמו ב-PATCH: אין מדיניות DELETE ב-RLS, ולכן המחיקה עוברת בשירות אחרי
  // אימות המשתמש ובדיקת השיוך לליד.
  const { data, error } = await getSupabaseAdmin()
    .from("lead_events")
    .delete()
    .eq("id", body.event_id)
    .eq("lead_id", leadId) // guard: the event must belong to this lead
    .or(NOT_GUBGET) // guard: גובגט's own log is a record, not a draft
    .select("id, event_type, event_text, created_by, created_at")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "האירוע לא נמצא (רישום של גובגט אינו ניתן למחיקה)" }, { status: 404 });
  }

  await logAudit({
    action: "delete",
    leadId,
    actor: user.email ?? user.id,
    changes: { lead_event: { from: `${data.event_type}: ${data.event_text}`, to: null } },
    meta: { event_id: data.id, original_author: data.created_by, created_at: data.created_at },
  });

  return NextResponse.json({ ok: true });
}
