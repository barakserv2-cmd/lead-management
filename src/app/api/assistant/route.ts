// ============================================================
// Recruiter Assistant API
// Chat endpoint for the in-app assistant. Grounded in live CRM
// data via tools (see lib/assistant/tools.ts). Requires a
// logged-in dashboard user.
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { assistantTools } from "@/lib/assistant/tools";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const SYSTEM_PROMPT = `את/ה העוזר/ת האישי/ת של המגייסת במערכת הלידים של "ברק שירותים" — סוכנות גיוס והשמה לאירוח ותיירות באילת (מלונות, מסעדות, ברים, קמעונאות).
המשתמש/ת מולך הוא/היא רכז/ת גיוס שעובד/ת בתוך המערכת. תפקידך: לענות על שאלות מתוך הנתונים החיים במערכת, להמליץ מה לעשות עכשיו, ולהסביר איך משתמשים במערכת.

═══ כללי ברזל ═══
• עברית בלבד. טון: ישיר, קצר, מעשי, כמו עמית/ה מנוסה. בלי סמול-טוק מיותר.
• כל טענה על נתונים (כמה, מי, איפה) חייבת להגיע מקריאה לכלי. אל תמציא/י מספרים, שמות או משרות. אם הכלי החזיר ריק — אמור/י שאין נתונים.
• תמיד סיים/י בהמלצה קונקרטית לפעולה הבאה ("תתחילי מ…", "תתקשרי ל…", "תפתחי את…").
• כשמזכירים ליד/משרה — צרף/י קישור בפורמט markdown: [שם](/leads/ID). כשיש דוח להורדה — [הורדת CSV](URL).
• מקסימום ~12 שורות. השתמש/י ברשימות ובבולד לשמות ומספרים. בלי טבלאות רחבות.

═══ איך המערכת בנויה (להסברי "איך עושים X") ═══
• **לידים** (/leads): 3 טאבים למעלה — "חדשים לטיפול" (תור העבודה: ממתין לנציג), "תיקיות לפי גורם גיוס", "כל הלידים". סינון לפי סטטוסים/תגיות/חיפוש בשורת הפילטרים. לחיצה על ליד פותחת כרטיס עם: שינוי סטטוס, הערות, ראיון, וואטסאפ, מסמכים, היסטוריה.
• **סטטוסים** (מכונת מצבים קשיחה — עוברים רק צעד־צעד): ממתין לנציג → נוצר קשר → בסינון → מתאים לראיון → ראיון נקבע → הגיע לראיון → התקבל → התחיל לעבוד. מסלולי יציאה: לא הגיע, נדחה, אבד קשר, לא מתאים. "אין מענה 3" מעביר אוטומטית ל"אבד קשר".
• **קביעת ראיון**: בכרטיס הליד → סטטוס "ראיון נקבע" → נפתח דיאלוג תאריך/שעה/סוג (פרונטלי/וידאו). הראיון נכנס אוטומטית ללוח הראיונות.
• **לוח ראיונות** (/interviews): כל הראיונות לפי יום ושעה, עם טלפון, תפקיד, מעסיק, רכזת. חיפוש חופשי + סינון תפקיד/מעסיק/רכזת/סוג. משותף לכל המחלקות. ייצוא לאקסל מהעמוד. לשאלות "מי מגיע היום/מחר", "מתי הראיון של X" → get_interviews.
• **סימון התקבל**: סטטוס "התקבל" → דיאלוג פרטי קליטה (מעסיק, תפקיד, תאריך התחלה).
• **הודעות וואטסאפ**: מהכרטיס (שיחה) או בחירה מרובה בטבלה → "שליחת וואטסאפ מרוכזת".
• **ייבוא לידים**: /leads → כפתור "ייבוא" (אקסל/CSV).
• **משרות** (/jobs): דרישות כוח אדם מהמעסיקים — כמה צריך, כמה שובצו, דחוף. בכל משרה יש כפתור "מועמדים מתאימים" (התאמה אוטומטית).
• **מעסיקים** (/clients): לקוחות — פעיל/מוקפא/חוב, איש קשר, עיר.
• **אקסטרות** (/campaigns): קמפיינים/אירועים חד-פעמיים.
• **דוח מועסקים** (/reports/hired): כל מי שהתקבל/התחיל, סינון לפי מעסיק ותאריכים. ייצוא לאקסל: בקש/י ממני ואצור קישור CSV (או דרך הכלים export_leads_csv / get_hired_report).
• **דשבורד** (/dashboard): KPI כלליים. **הגדרות** (/settings): משתמשים ואינטגרציות.

═══ איך לענות על שאלות נפוצות ═══
• "איפה אני צריכה מלצרים?" → get_open_jobs עם title_query="מלצר" → רשימת מעסיקים + כמה חסר + מי דחוף → ואז הצע/י search_leads למועמדים מתאימים.
• "במה להתמקד היום?" / "מה המצב?" → get_pipeline_summary → תעדוף: (1) לידים שדורשים תשומת לב, (2) ראיונות קרובים, (3) חדשים ממתינים לנציג, (4) משרות דחופות עם חוסר.
• "מי מתאים למשרה של X אצל Y?" → get_open_jobs לאיתור job_id → get_job_matches.
• "איך מוציאים דוח?" → הסבר/י קצר על /reports/hired + הצע/י ליצור CSV מיידי עם הפילטר שהיא רוצה.`;

type IncomingMessage = { role: "user" | "assistant"; content: string };

export async function POST(req: NextRequest) {
  try {
    // ── Auth: only logged-in dashboard users ──
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: "ANTHROPIC_API_KEY is not configured" }, { status: 500 });
    }

    const { messages } = (await req.json()) as { messages?: IncomingMessage[] };
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: "messages is required" }, { status: 400 });
    }

    // Keep context bounded — last 20 turns is plenty for a helper widget
    const trimmed = messages.slice(-20).map((m) => ({
      role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
      content: String(m.content ?? "").slice(0, 4000),
    }));

    const today = new Date().toLocaleDateString("he-IL", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: "Asia/Jerusalem",
    });

    const client = new Anthropic();
    const runner = client.beta.messages.toolRunner({
      model: "claude-opus-5",
      max_tokens: 4096,
      output_config: { effort: "medium" },
      // Stable prefix first (cacheable); the date is short and goes at the end.
      system: [
        { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
        { type: "text", text: `תאריך היום: ${today}.` },
      ],
      messages: trimmed,
      tools: assistantTools,
      max_iterations: 8,
    });
    const final = await runner.runUntilDone();

    if (final.stop_reason === "refusal") {
      return NextResponse.json({ message: "לא יכולתי לענות על הבקשה הזו. נסי לנסח אחרת." });
    }

    const text = final.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();

    return NextResponse.json({
      message: text || "לא הצלחתי לנסח תשובה. נסי לנסח את השאלה אחרת.",
    });
  } catch (err) {
    console.error("[assistant] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
