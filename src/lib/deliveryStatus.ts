// ============================================================
// סטטוס מסירה — נשלחה / נמסרה / נקראה / נכשלה
// ============================================================
//
// שלושה ספקים שולחים עדכון אחרי כל הודעה: מטא (דרך גובגט), 360dialog
// (הערוץ הרשמי של הרכזות) ו-GreenAPI. עד 16.09 כולם אישרו את העדכון
// וזרקו אותו, ולכן המערכת ידעה רק שהודעה *יצאה* — לא שהגיעה.
//
// כאן הכללים המשותפים: באיזה סדר סטטוס מתקדם, ואיך מתרגמים כישלון של
// ספק למשפט שרכזת מבינה ויודעת מה לעשות איתו.

import type { SupabaseClient } from "@supabase/supabase-js";

export type DeliveryStatus = "sent" | "delivered" | "read" | "failed";

const RANK: Record<Exclude<DeliveryStatus, "failed">, number> = {
  sent: 1,
  delivered: 2,
  read: 3,
};

/**
 * הסטטוס החדש, או null אם אין שינוי.
 *
 * עדכונים מגיעים לא בהכרח לפי הסדר — "נקראה" יכול להקדים את "נמסרה".
 * לכן סטטוס רק מתקדם: אחרי "נקראה" לא חוזרים ל"נמסרה".
 *
 * כישלון גובר רק על "נשלחה". הודעה שכבר נמסרה או נקראה הגיעה למועמד,
 * ועדכון כישלון מאוחר עליה הוא רעש — אם נסמן אותה ❌ רכזת תתקשר לשווא.
 */
export function nextDeliveryStatus(
  current: string | null | undefined,
  incoming: DeliveryStatus
): DeliveryStatus | null {
  const cur = (current ?? null) as DeliveryStatus | null;
  if (cur === incoming) return null;
  if (incoming === "failed") {
    return cur === null || cur === "sent" ? "failed" : null;
  }
  if (cur === "failed") return incoming === "delivered" || incoming === "read" ? incoming : null;
  if (cur === null) return incoming;
  return RANK[incoming] > RANK[cur] ? incoming : null;
}

interface MetaError {
  code?: number;
  title?: string;
  message?: string;
  error_data?: { details?: string };
}

/** כישלון של מטא / 360dialog, במשפט שאומר לרכזת מה לעשות. */
export function describeMetaError(errors: MetaError[] | null | undefined): string {
  const e = errors?.[0];
  if (!e) return "ההודעה לא נמסרה (מטא לא מסרה סיבה)";
  switch (e.code) {
    case 131026:
      return "ההודעה לא נמסרה — המספר לא בוואטסאפ, או שהאפליקציה אצל המועמד ישנה מדי. כדאי להתקשר.";
    case 131047:
      return "ההודעה לא נמסרה — עברו יותר מ-24 שעות מההודעה האחרונה של המועמד, ומחוץ לחלון מותר לשלוח רק תבנית מאושרת.";
    case 131049:
      return "מטא עצרה את ההודעה כדי לא להציף את המועמד בהודעות שיווקיות. כדאי להתקשר.";
    case 131048:
      return "מטא הגבילה את המספר שלנו בגלל חשד לספאם — ההודעה לא נשלחה.";
    case 131050:
      return "המועמד ביקש לא לקבל מאיתנו הודעות שיווקיות.";
    case 131051:
      return "סוג ההודעה לא נתמך אצל המועמד.";
    case 131053:
      return "הקובץ לא עלה — ההודעה לא נשלחה.";
    case 130472:
      return "מטא לא מסרה את ההודעה (המועמד נמצא בניסוי של מטא על הודעות שיווקיות).";
    case 131000:
      return "תקלה אצל מטא — ההודעה לא נמסרה. אפשר לנסות שוב.";
    default:
      return `ההודעה לא נמסרה — ${e.error_data?.details || e.message || e.title || `קוד ${e.code}`}`;
  }
}

/**
 * עדכון של GreenAPI (outgoingMessageStatus). GreenAPI מבדילה בין כמה סוגי
 * כישלון שאצלנו כולם "נכשלה", כל אחד עם הסבר משלו.
 */
export function mapGreenApiStatus(
  status: string | null | undefined,
  description?: string | null
): { status: DeliveryStatus; error: string | null } | null {
  switch (status) {
    case "sent":
    case "delivered":
    case "read":
      return { status, error: null };
    case "noAccount":
      return { status: "failed", error: "ההודעה לא נמסרה — המספר לא רשום בוואטסאפ. כדאי להתקשר." };
    case "yellowCard":
      return { status: "failed", error: "GreenAPI עצרו את השליחה בחשד לספאם — ההודעה לא נשלחה." };
    case "notInGroup":
      return { status: "failed", error: "ההודעה לא נשלחה — המספר לא בקבוצה." };
    case "failed":
      return { status: "failed", error: `ההודעה לא נמסרה${description ? ` — ${description}` : ""}` };
    default:
      return null; // pending וכדומה — מחכים לעדכון הבא
  }
}

/**
 * מחיל עדכון על ההודעה שהמזהה שלה תואם.
 *
 * flagLead: כשהודעה של רכזת נכשלה, הליד מסומן "דורש טיפול". להודעות של
 * גובגט לא — שם גובגט פותח אסקלציה ושולח אותה דרך הגשר, וסימון כפול היה
 * מציף את התור.
 */
export async function applyDeliveryStatus(
  db: SupabaseClient,
  providerMsgId: string,
  incoming: DeliveryStatus,
  error: string | null,
  opts: { flagLead: boolean }
): Promise<{ updated: number; failedLeadIds: string[] }> {
  const id = providerMsgId.trim();
  if (!id) return { updated: 0, failedLeadIds: [] };

  const { data: rows } = await db
    .from("messages")
    .select("id, lead_id, delivery_status")
    .eq("provider_msg_id", id);

  let updated = 0;
  const failedLeadIds: string[] = [];
  for (const row of rows ?? []) {
    const next = nextDeliveryStatus(row.delivery_status as string | null, incoming);
    if (!next) continue;
    const { error: upErr } = await db
      .from("messages")
      .update({
        delivery_status: next,
        delivery_error: next === "failed" ? error : null,
        delivery_updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    if (upErr) continue;
    updated++;
    if (next === "failed" && row.lead_id) failedLeadIds.push(row.lead_id as string);
  }

  if (opts.flagLead) {
    for (const leadId of failedLeadIds) {
      await db
        .from("leads")
        .update({
          needs_attention: true,
          needs_attention_at: new Date().toISOString(),
          attention_reason: error ?? "הודעה למועמד לא נמסרה",
        })
        .eq("id", leadId);
    }
  }

  return { updated, failedLeadIds };
}
