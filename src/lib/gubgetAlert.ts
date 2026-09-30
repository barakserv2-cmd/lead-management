// ============================================================
// התראות לצוות דרך גובגט.
//
// 30.09: V1 שולח את ההתראות שלו מ-GreenAPI, והמופע שם נמחק ב-14.09 —
// כל התראה מאז נעלמה בשקט. גובגט הוא הערוץ היחיד שמגיע לצוות בוודאות:
// טקסט חופשי כשהחלון פתוח, ותבנית staff_alert מאושרת כשהוא סגור.
//
// title / subject / reason הם שלושת פרמטרי התבנית ("🔔 {title} ·
// מועמד/ת: {subject} · סיבה: {reason}") — שורה אחת כל אחד.
// ============================================================

/** למי: "admins" = סער; "recruiters" = כל רשימת ההסלמה; או שם מהרשימה ("תמי"). */
export type AlertRecipient = "admins" | "recruiters" | string;

export interface GubgetAlert {
  title: string;
  subject: string;
  reason: string;
  /** גרסה מפורטת לחלון פתוח */
  text?: string;
  to?: AlertRecipient;
}

/** null = נשלח; אחרת — למה לא. */
export async function alertViaGubget(alert: GubgetAlert): Promise<string | null> {
  const base = process.env.MACHINE_INGEST_URL;
  const key = process.env.MACHINE_INGEST_KEY;
  if (!base || !key) return "חסרים MACHINE_INGEST_URL/KEY";
  try {
    const res = await fetch(`${base}/api/v1/bridge/alert`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-ingest-key": key },
      body: JSON.stringify(alert),
      signal: AbortSignal.timeout(20_000),
    });
    const body = (await res.json().catch(() => ({}))) as { ok?: boolean; sentTo?: number };
    if (!res.ok || !body.ok) return `גובגט החזיר ${res.status} (sentTo=${body.sentTo ?? 0})`;
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}
