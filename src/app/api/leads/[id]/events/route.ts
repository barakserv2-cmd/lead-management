import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { STATUS_LABELS, type LeadStatusValue } from "@/lib/stateMachine";

// יומן אירועים לליד: אירועים ידניים (lead_events) + שינויי סטטוס
// אוטומטיים (lead_status_history) ממוזגים לציר זמן אחד.
// fetch+API ולא server action — הדפוס הקבוע בפרויקט (Next 16).

export interface TimelineEvent {
  id: string;
  kind: "event" | "status";
  event_type: string;
  text: string;
  created_by: string;
  created_at: string;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: leadId } = await params;

  const [eventsRes, historyRes] = await Promise.all([
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
  ]);

  // הטבלה עוד לא קיימת עד שהמיגרציה תרוץ — מחזירים ציר זמן חלקי במקום 500
  const manual: TimelineEvent[] = (eventsRes.error ? [] : eventsRes.data ?? []).map((e) => ({
    id: e.id,
    kind: "event" as const,
    event_type: e.event_type,
    text: e.event_text,
    created_by: e.created_by,
    created_at: e.created_at,
  }));

  const statusChanges: TimelineEvent[] = (historyRes.data ?? []).map((h) => ({
    id: h.id,
    kind: "status" as const,
    event_type: "שינוי סטטוס",
    text:
      `${STATUS_LABELS[h.from_status as LeadStatusValue] ?? h.from_status} ← ${STATUS_LABELS[h.to_status as LeadStatusValue] ?? h.to_status}` +
      (h.notes ? ` — ${h.notes}` : ""),
    created_by: h.changed_by ?? "מערכת",
    created_at: h.changed_at,
  }));

  const timeline = [...manual, ...statusChanges].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

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
