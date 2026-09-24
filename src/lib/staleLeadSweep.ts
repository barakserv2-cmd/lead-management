/**
 * מי מהלידים ה"תקועים" צריך לחזור לגובגט.
 *
 * שני חורים אמיתיים שנמדדו ב-24.09:
 *
 * 1. `cron/sync-new-leads` דוחף רק לידים מ-3 הדקות האחרונות ואין לו ניסיון
 *    חוזר. כשגובגט היה מנותק (14–16.09) כל ליד שנכנס באותם ימים נפל בין
 *    הכיסאות לתמיד — החלון עבר, ואף אחד לא חזר אליו.
 *
 * 2. בעלות אנושית הייתה נעילה ללא תפוגה: ברגע שליד נשא שם של רכזת, גובגט
 *    לא פתח איתו לעולם. חציון התגובה כשגובגט ענה ראשון: 0.1 דקות.
 *    כשאדם ענה ראשון: 1,060 דקות.
 *
 * ההחלטה כאן שמרנית בכוונה — היא רק *מציעה* ליד לגובגט. גובגט עצמו שואל
 * שוב את v1 (`lead-check`) לפני שהוא פותח, ושם נבדקים DNC, הקפאה מפורשת
 * ודגל אדום פתוח. שכבה אחת לא מחליפה את השנייה.
 */

export const OWNER_SILENT_HOURS = 3;
const GUBGET = "gubget@eilatjobs.com";

export interface SweepLead {
  phone: string | null;
  source: string | null;
  status: string;
  created_at: string;
  handled_by: string | null;
  handled_at: string | null;
  do_not_contact: boolean | null;
  /** יצאה כבר הודעה כלשהי (רכזת או בוט)? */
  hasOutbound: boolean;
}

export type SweepVerdict =
  | { push: true; why: "never_pushed" | "owner_silent" }
  | { push: false; why: string };

export function sweepVerdict(
  l: SweepLead,
  openStatuses: readonly string[],
  now: Date = new Date()
): SweepVerdict {
  if (!l.phone) return { push: false, why: "no_phone" };
  if (l.do_not_contact) return { push: false, why: "dnc" };
  if (l.source === "גובגט") return { push: false, why: "own_lead" };
  if (!openStatuses.includes(l.status)) return { push: false, why: "not_open" };
  // כבר מישהו כתב — זו לא פנייה ראשונה שנפלה, זו שיחה קיימת.
  if (l.hasOutbound) return { push: false, why: "already_contacted" };

  const owner = (l.handled_by ?? "").trim().toLowerCase();
  if (!owner || owner === GUBGET) return { push: true, why: "never_pushed" };

  // בעלות אנושית: פותחים רק אחרי שהרכזת שתקה מעבר לסף. בלי handled_at
  // אי אפשר לדעת כמה זמן — ואז משאירים את הנעילה הישנה על כנה.
  if (!l.handled_at) return { push: false, why: "owner_no_timestamp" };
  const hours = (now.getTime() - new Date(l.handled_at).getTime()) / 3600_000;
  if (!Number.isFinite(hours)) return { push: false, why: "owner_bad_timestamp" };
  return hours >= OWNER_SILENT_HOURS
    ? { push: true, why: "owner_silent" }
    : { push: false, why: "owner_fresh" };
}
