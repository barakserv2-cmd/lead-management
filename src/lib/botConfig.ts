// ============================================================
// Bot phase 1 — קונפיגורציית הפעלה (מתג, מקורות, מכסות)
// ============================================================
//
// SCREENING_BOT_MODE:    off (ברירת מחדל) | shadow | live
//   off    — שום דבר. גם לידים בסטטוס "בסינון" לא מקבלים מענה אוטומטי.
//   shadow — הבוט מנסח טיוטות פתיחה לכל ליד חדש ושומר אותן לבדיקה,
//            בלי לשלוח כלום ובלי לגעת בליד. לצפייה: הגדרות ← בוט הסינון.
//   live   — שליחה אמיתית.
//
// SCREENING_BOT_SOURCES: "all" או רשימה מופרדת בפסיקים של מקורות
//   (למשל "דף נחיתה,AllJobs"). חל גם על shadow — כדי שהצל ישקף
//   בדיוק את מה שיקרה ב-live.
//
// BOT_DAILY_CAP_PER_NUMBER: תקרת הודעות פתיחה יומית פר מספר (ברירת
//   מחדל 60) — הגנה מחסימת WhatsApp.
//
// BOT_REJECT_ENABLED: "true" מאפשר לבוט לדחות לידים סופית. ברירת
//   מחדל false — בחודש הראשון כל "דחייה" הופכת להעברה לרכזת.

export type BotMode = "off" | "shadow" | "live";

export function botMode(): BotMode {
  const raw = (process.env.SCREENING_BOT_MODE ?? "off").trim().toLowerCase();
  return raw === "live" || raw === "shadow" ? raw : "off";
}

/** האם המקור הזה מופעל לבוט (חל גם על מצב צל). */
export function botSourceEnabled(source: string | null | undefined): boolean {
  const raw = (process.env.SCREENING_BOT_SOURCES ?? "").trim();
  if (!raw) return false;
  if (raw.toLowerCase() === "all") {
    // "אימייל ישיר" לעולם לא אוטומטי — לשם נופל כל מה שלא זוהה,
    // כולל מיילים שאינם מועמדים.
    return source !== "אימייל ישיר";
  }
  const allowed = raw.split(",").map((s) => s.trim()).filter(Boolean);
  return !!source && allowed.includes(source);
}

export function botDailyCapPerNumber(): number {
  const n = Number(process.env.BOT_DAILY_CAP_PER_NUMBER ?? 60);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 60;
}

export function botRejectEnabled(): boolean {
  return (process.env.BOT_REJECT_ENABLED ?? "").trim().toLowerCase() === "true";
}

/** ליד "טרי" (נוצר בדקות האחרונות) פטור משעות שקט — המועמד פעיל עכשיו. */
export const FRESH_LEAD_MINUTES = 15;

/** כמה פתיחות לכל היותר נשלחות בריצת עיבוד אחת (סריקת Gmail / cron). */
export const WELCOME_BATCH_LIMIT = 5;

/** השהיה אנושית בין הודעות פתיחה באותה ריצה (מ"ש). */
export const WELCOME_SPACING_MS: [number, number] = [3000, 8000];
