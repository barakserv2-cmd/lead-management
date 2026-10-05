import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * תזכורות "להתקשר שוב" שכבר אין בהן צורך.
 *
 * "מעקב" מחייב תזכורת בכוונה — בלי תאריך הוא לא משימה אלא כוונה, ו-21
 * מועמדים נתקעו ככה. אבל עד 24.09 שום דבר לא סגר את התזכורת אחר כך:
 * חושן שמה מועמדת במעקב תוך כדי שיחה, קבעה לה ראיון באותו ערב, והתזכורת
 * "להתקשר שוב" צצה לה למחרת בבוקר. מי שכבר קבע ראיון או נסגר לא אמור
 * להופיע ברשימת ההתקשרויות.
 *
 * best-effort: כשל כאן לא מפיל את שינוי הסטטוס עצמו.
 */
export async function completeLeadReminders(
  db: SupabaseClient,
  leadId: string
): Promise<number> {
  try {
    const { data } = await db
      .from("reminders")
      .update({ is_completed: true, completed_at: new Date().toISOString() })
      .eq("lead_id", leadId)
      .eq("is_completed", false)
      .select("id");
    return data?.length ?? 0;
  } catch (e) {
    console.error("[Reminders] auto-complete failed:", (e as Error).message);
    return 0;
  }
}

/** סטטוסים שבהם אין יותר על מה להתקשר: ראיון נקבע, המועמד הגיע, או שהליד נסגר. */
export const REMINDER_CLEARING_STATUSES = new Set<string>([
  "INTERVIEW_BOOKED", "ARRIVED", "HIRED", "STARTED",
  "REJECTED", "NOT_SUITABLE", "LOST_CONTACT", "NOT_ACCEPTED", "INVALID_PHONE",
  "EMPLOYMENT_ENDED", "NO_SHOW", "CANCELLED_ARRIVAL", "NEVER_STARTED",
]);
