// ============================================================
// מה שנכנס מגובגט דרך /api/bridge/from-machine — עזרים שאפשר לבדוק
// ============================================================

import type { SupabaseClient } from "@supabase/supabase-js";

/** בקשה בלי שום מזהה: ניסיון חוזר שלה מגיע תוך הזמן הזה. */
export const RETRY_WINDOW_MS = 60_000;
/** שליחה חוזרת נושאת את אותה חותמת זמן; הודעה אמיתית חוזרת — חותמת משלה. */
const SAME_MOMENT_MS = 1000;
/** הודעת רכזת שיצאה דרך מספר הבוט חוזרת מגובגט תוך שניות; זה מרווח ביטחון. */
export const RECRUITER_ECHO_WINDOW_MS = 15 * 60_000;

export interface InboundMessage {
  role: "user" | "assistant";
  content: string;
  providerMsgId: string | null;
  createdAt: string | null;
}

/**
 * הבקשה הזו היא שליחה חוזרת של בקשה שכבר נקלטה?
 * true — יש בה הודעות עם מזהה וכולן כבר שמורות; false — לפחות אחת חדשה
 * (חילופי דברים חדשים); null — אין בה אף מזהה, אי אפשר לדעת.
 */
export async function isResentPayload(
  db: SupabaseClient,
  leadId: string,
  msgs: InboundMessage[]
): Promise<boolean | null> {
  const ids = [...new Set(msgs.map((m) => m.providerMsgId).filter((id): id is string => !!id))];
  if (ids.length === 0) return null;
  const { data } = await db.from("messages").select("provider_msg_id").eq("lead_id", leadId).in("provider_msg_id", ids);
  const known = new Set((data ?? []).map((r) => r.provider_msg_id as string));
  return ids.every((id) => known.has(id));
}

/**
 * רכזת ששולחת מהצ'אט למועמד/ת שמדברים עם הבוט — ההודעה יוצאת ממספר הבוט
 * (send-manual → sendViaMachine) ונשמרת כ-recruiter בלי via_instance ובלי
 * מזהה. גובגט מדווח עליה אחר כך כהודעת בוט, עם המזהה. זו אותה הודעה:
 * מחזירים את השורה של הרכזת כדי לחבר אליה את המזהה, ולא נוספת שורת "AI".
 * 04–05.10: 43 הודעות כאלה הופיעו פעמיים (תמי: "שולח את אותה ההודעה בפעם השנייה").
 */
async function findRecruiterEcho(
  db: SupabaseClient,
  leadId: string,
  m: InboundMessage,
  now?: Date
): Promise<string | null> {
  const ref = m.createdAt ? new Date(m.createdAt).getTime() : (now ?? new Date()).getTime();
  const { data } = await db
    .from("messages")
    .select("id")
    .eq("lead_id", leadId)
    .eq("role", "recruiter")
    .eq("content", m.content)
    .is("via_instance", null)
    .is("provider_msg_id", null)
    .gte("created_at", new Date(ref - RECRUITER_ECHO_WINDOW_MS).toISOString())
    .lte("created_at", new Date(ref + SAME_MOMENT_MS).toISOString())
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return data ? (data.id as string) : null;
}

/**
 * ההודעה כבר שמורה? גובגט שולח לפעמים את אותה בקשה שוב, אבל מועמד/ת גם
 * עונה "כן" לשתי שאלות בהפרש של דקה — ולכן טקסט זהה לבדו אינו כפילות:
 *   1. יש מזהה → לפי המזהה.
 *   2. יש חותמת זמן → אותו טקסט מאותו צד באותו רגע.
 *   3. אין אף אחד מהם (כך מגיעות היום הודעות המועמד/ת מגובגט) — הבקשה
 *      עצמה מכריעה:
 *      - הודעות הבוט שבה כבר שמורות (שליחה חוזרת) → אותו טקסט = אותה הודעה;
 *      - יש בה הודעת בוט חדשה → חילופי דברים חדשים, ההודעה חדשה;
 *      - אין בה שום מזהה → כפילות רק אם אותו טקסט מאותו צד נשמר בדקה האחרונה.
 * `attachId`: נמצאה שורה ישנה בלי מזהה, וכדאי לחבר אליה את המזהה.
 */
export async function findBridgeDuplicate(
  db: SupabaseClient,
  leadId: string,
  m: InboundMessage,
  ctx: { resend: boolean | null; now?: Date }
): Promise<{ id: string; attachId: boolean } | null> {
  if (m.providerMsgId) {
    const { data: byId } = await db
      .from("messages")
      .select("id")
      .eq("lead_id", leadId)
      .eq("provider_msg_id", m.providerMsgId)
      .limit(1)
      .maybeSingle();
    if (byId) return { id: byId.id as string, attachId: false };
  }

  if (m.role === "assistant") {
    const echo = await findRecruiterEcho(db, leadId, m, ctx.now);
    if (echo) return { id: echo, attachId: true };
  }

  const same = () =>
    db.from("messages").select("id, provider_msg_id").eq("lead_id", leadId).eq("role", m.role).eq("content", m.content);

  if (m.createdAt) {
    const t = new Date(m.createdAt).getTime();
    const { data } = await same()
      .gte("created_at", new Date(t - SAME_MOMENT_MS).toISOString())
      .lte("created_at", new Date(t + SAME_MOMENT_MS).toISOString())
      .limit(5);
    for (const row of data ?? []) {
      const rowId = (row.provider_msg_id as string | null) ?? null;
      // שני מזהים שונים הם שתי הודעות, גם כשהטקסט והרגע זהים
      if (rowId && m.providerMsgId && rowId !== m.providerMsgId) continue;
      return { id: row.id as string, attachId: !rowId };
    }
    return null;
  }

  // מזהה חדש בלי חותמת זמן, או בקשה עם הודעת בוט חדשה — הודעה חדשה
  if (m.providerMsgId || ctx.resend === false) return null;

  let q = same();
  if (ctx.resend === null) {
    const now = (ctx.now ?? new Date()).getTime();
    q = q.gte("created_at", new Date(now - RETRY_WINDOW_MS).toISOString());
  }
  const { data } = await q.order("created_at", { ascending: false }).limit(1).maybeSingle();
  return data ? { id: data.id as string, attachId: false } : null;
}

/** שומר את הודעות הבקשה, בלי כפילויות. מחזיר כמה נוספו. */
export async function appendBridgeMessages(
  db: SupabaseClient,
  leadId: string,
  inbound: InboundMessage[],
  now?: Date,
  /** אם הועבר — נאספות לתוכו ההודעות שנשמרו עכשיו בפועל (לא כפילויות) */
  appendedOut?: InboundMessage[]
): Promise<number> {
  const resend = await isResentPayload(db, leadId, inbound);
  let appended = 0;
  for (const m of inbound) {
    const dupe = await findBridgeDuplicate(db, leadId, m, { resend, now });
    if (dupe) {
      // אותה הודעה שנשמרה פעם בלי מזהה — מחברים את המזהה עכשיו
      if (dupe.attachId && m.providerMsgId) {
        await db
          .from("messages")
          .update({ provider_msg_id: m.providerMsgId, ...(m.role === "assistant" ? { delivery_status: "sent" } : {}) })
          .eq("id", dupe.id);
      }
      continue;
    }
    await db.from("messages").insert({
      lead_id: leadId,
      role: m.role,
      content: m.content,
      ...(m.providerMsgId ? { provider_msg_id: m.providerMsgId } : {}),
      ...(m.providerMsgId && m.role === "assistant" ? { delivery_status: "sent" } : {}),
      ...(m.createdAt ? { created_at: m.createdAt } : {}),
    });
    appended++;
    appendedOut?.push(m);
  }
  return appended;
}

/** אותו מועד ראיון? interview_date נשמר כשעון קיר ישראלי עם תווית UTC. */
export function sameSlot(stored: string | null | undefined, naive: string): boolean {
  if (!stored) return false;
  return stored.replace(" ", "T").slice(0, 16) === naive.slice(0, 16);
}

export function slotLabel(naive: string): string {
  const [d, t] = naive.split("T");
  const [y, mo, day] = d.split("-");
  return `${day}.${mo}.${y} ${t.slice(0, 5)}`;
}

/** רשומת יומן מגובגט — רק אם אותו טקסט עוד לא נרשם על הליד. */
export async function noteOnce(db: SupabaseClient, leadId: string, author: string, text: string): Promise<void> {
  const { data: seen } = await db
    .from("lead_events")
    .select("id")
    .eq("lead_id", leadId)
    .eq("event_text", text)
    .limit(1)
    .maybeSingle();
  if (seen) return;
  await db.from("lead_events").insert({ lead_id: leadId, event_type: "גובגט", event_text: text, created_by: author });
}
