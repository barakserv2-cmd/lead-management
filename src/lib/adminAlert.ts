// ============================================================
// התראה לאדמין — דרך כל ערוץ שעובד כרגע
// ============================================================
//
// עד עכשיו חלק מההתראות הפנימיות (ערוץ לידים שנדם, מספר שנפל, הסיכום
// השבועי) יצאו מהמספר העסקי ב-GreenAPI בלבד. ה-instance הזה נמחק — ואז גם
// ההתראה על הבעיה לא יכלה לצאת. מעכשיו מנסים לפי הסדר:
//   1. גובגט (lib/gubgetAlert.ts) — מגיע לצוות גם כשחלון 24 השעות סגור,
//      דרך תבנית staff_alert מאושרת.
//   2. המספר העסקי, ואז כל מספר GreenAPI פעיל אחר — טקסט חופשי.
// המספרים בערוץ הרשמי (cloud) לא נכללים: מחוץ לחלון הם שולחים רק תבנית.
// כשההתראה היא על גובגט עצמו (gubgetLast) — מתחילים מ-GreenAPI.
//
// הודעה פנימית לצוות — לא עוברת בשער המועמדים (skipGate).

import { createClient } from "@supabase/supabase-js";
import { alertViaGubget } from "@/lib/gubgetAlert";
import {
  businessAccount,
  getAccountByInstance,
  sendWhatsAppMessage,
  type WhatsAppAccount,
} from "@/lib/whatsappService";

export function adminAlertPhone(): string {
  return (process.env.ADMIN_ALERT_PHONE ?? "0547000992").trim();
}

/** title / subject / reason הם פרמטרי התבנית של גובגט — שורה אחת כל אחד. */
export interface AdminAlert {
  title: string;
  subject: string;
  reason: string;
  /** ההודעה המלאה, לחלון פתוח ול-GreenAPI */
  text: string;
}

export interface AdminAlertResult {
  sent: boolean;
  /** הערוץ שההתראה יצאה ממנו */
  via?: string;
  /** השגיאה האחרונה, כשאף ערוץ לא הצליח */
  error?: string;
}

// פרמטר תבנית הוא שורה אחת, ומטא מגבילה את אורכו
const oneLine = (s: string, max = 900) => {
  const line = s.replace(/\s*\n+\s*/g, " · ").trim();
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
};

/** מספרי GreenAPI לנסות, לפי הסדר: העסקי, ואז מספרים פעילים אחרים. */
async function greenSenders(exclude: string[]): Promise<WhatsAppAccount[]> {
  const senders: WhatsAppAccount[] = [];
  const biz = businessAccount();
  if (biz.instanceId && biz.token && !exclude.includes(biz.instanceId)) senders.push(biz);

  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data } = await db
    .from("whatsapp_accounts")
    .select("instance_id, provider")
    .eq("is_active", true);
  for (const row of data ?? []) {
    const id = String(row.instance_id);
    if (row.provider === "cloud" || exclude.includes(id) || id === biz.instanceId) continue;
    const acc = await getAccountByInstance(id);
    // לא נמצא → getAccountByInstance מחזיר את העסקי, שכבר ברשימה
    if (acc.instanceId === id && acc.provider !== "cloud") senders.push(acc);
  }
  return senders;
}

/**
 * שולח את ההתראה לאדמין מהערוץ הראשון שמצליח. לעולם לא זורק.
 * `exclude` — מספרי GreenAPI שלא לנסות (למשל המספר שעליו ההתראה עצמה).
 * `phone` — יעד שאינו האדמין. גובגט מכיר רק את רשימת הצוות שלו, ולכן אז
 * שולחים רק דרך GreenAPI.
 */
export async function alertAdmin(
  alert: AdminAlert,
  opts: { exclude?: string[]; gubgetLast?: boolean; phone?: string } = {}
): Promise<AdminAlertResult> {
  let lastError = "אין ערוץ זמין לשליחת התראות";
  const to = opts.phone?.trim() || adminAlertPhone();
  const digits = (p: string) => p.replace(/\D/g, "").replace(/^972/, "0");
  const viaGubget = digits(to) === digits(adminAlertPhone());

  const tryGubget = async (): Promise<AdminAlertResult | null> => {
    const err = await alertViaGubget({
      title: oneLine(alert.title, 120),
      subject: oneLine(alert.subject, 120),
      reason: oneLine(alert.reason),
      text: alert.text,
      to: "admins",
    });
    if (!err) return { sent: true, via: "גובגט" };
    lastError = err;
    console.error("[adminAlert] via גובגט failed:", err);
    return null;
  };

  const tryGreen = async (): Promise<AdminAlertResult | null> => {
    try {
      for (const account of await greenSenders(opts.exclude ?? [])) {
        const res = await sendWhatsAppMessage(to, alert.text, account, { skipGate: true });
        if (res.success) return { sent: true, via: account.label ?? account.instanceId };
        lastError = res.error ?? "send failed";
        console.error(`[adminAlert] via ${account.label ?? account.instanceId} failed:`, lastError);
      }
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      console.error("[adminAlert] GreenAPI fallback threw:", e);
    }
    return null;
  };

  const order = !viaGubget ? [tryGreen] : opts.gubgetLast ? [tryGreen, tryGubget] : [tryGubget, tryGreen];
  for (const attempt of order) {
    const res = await attempt();
    if (res) return res;
  }
  return { sent: false, error: lastError };
}
