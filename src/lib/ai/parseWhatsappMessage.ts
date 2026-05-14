import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export type WhatsAppIntent =
  | "interested"          // wants the job / coming to interview
  | "not_interested"      // declines / wants to be removed
  | "availability_change" // restricts shifts/days
  | "location_change"     // moved / new location
  | "salary_request"      // mentions desired salary
  | "complaint"           // upset / complaint
  | "question"            // asks something — needs human reply
  | "logistics"           // address / how to reach / parking
  | "other";

export interface WhatsAppNLU {
  intent: WhatsAppIntent;
  entities: {
    available_shifts?: string[];          // ["mornings","evenings","nights","weekends"]
    unavailable_days?: string[];          // ["שישי","שבת"]
    preferred_location?: string;          // free text
    min_salary?: number;                  // ₪/hr or ₪/month — context-dependent
    salary_unit?: "hour" | "month" | "shift" | "unknown";
    start_date?: string;                  // ISO date if mentioned
  };
  confidence: number;                     // 0..1
  needs_attention: boolean;               // recruiter must read this
  summary: string;                        // 1-line Hebrew summary of the message
}

export interface LeadContext {
  name: string | null;
  status: string | null;
  location: string | null;
  job_title: string | null;
}

const SYSTEM_PROMPT = `אתה מנתח הודעות וואטסאפ נכנסות ממועמדים לעבודה בענף האירוח באילת.
המטרה: לזהות כוונה (intent), לחלץ נתונים שמשנים את הפרופיל של הליד, ולהחליט אם צריך התערבות אנושית.

החזר אך ורק JSON תקין, ללא טקסט נוסף. השדות:
- intent: אחד מ: interested, not_interested, availability_change, location_change, salary_request, complaint, question, logistics, other
- entities: אובייקט עם השדות הרלוונטיים בלבד (השאר תשמיט):
  - available_shifts: מערך מתוך ["mornings","evenings","nights","weekends"]
  - unavailable_days: מערך מילים בעברית (למשל ["שישי","שבת"])
  - preferred_location: מחרוזת
  - min_salary: מספר
  - salary_unit: "hour" | "month" | "shift" | "unknown"
  - start_date: תאריך ISO (YYYY-MM-DD)
- confidence: ציון 0-1 לאיכות החילוץ
- needs_attention: true אם רכזת צריכה לקרוא את ההודעה ולא רק לאפשר אוטומציה לטפל. דוגמאות: תלונה, שאלה לא טריוויאלית, מצב חירום, ביטול ראיון, בקשת שינוי תנאים
- summary: שורה אחת בעברית שמסבירה את ההודעה במילים פשוטות

דוגמה 1 — הודעה: "אני יכול רק בקרים":
{"intent":"availability_change","entities":{"available_shifts":["mornings"]},"confidence":0.95,"needs_attention":false,"summary":"זמין רק בבוקר"}

דוגמה 2 — הודעה: "תודה, לא מתאים לי":
{"intent":"not_interested","entities":{},"confidence":0.95,"needs_attention":true,"summary":"מסיר מועמדות"}

דוגמה 3 — הודעה: "כמה זה משלם?":
{"intent":"question","entities":{},"confidence":0.9,"needs_attention":true,"summary":"שואל על תנאי שכר"}`;

export async function analyzeWhatsappMessage(
  message: string,
  context: LeadContext
): Promise<WhatsAppNLU | null> {
  try {
    const userContent =
      `הקשר על הליד:\n` +
      `- שם: ${context.name ?? "לא ידוע"}\n` +
      `- סטטוס נוכחי: ${context.status ?? "לא ידוע"}\n` +
      `- מיקום: ${context.location ?? "לא ידוע"}\n` +
      `- תפקיד שהוגש: ${context.job_title ?? "לא ידוע"}\n\n` +
      `הודעת המועמד:\n"${message}"`;

    const res = await anthropic.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 512,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userContent }],
    });

    const text = res.content[0]?.type === "text" ? res.content[0].text : "";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;

    const parsed = JSON.parse(match[0]);
    return {
      intent: parsed.intent ?? "other",
      entities: parsed.entities ?? {},
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.5,
      needs_attention: parsed.needs_attention === true,
      summary: typeof parsed.summary === "string" ? parsed.summary : "",
    };
  } catch (err) {
    console.error("[NLU] failed", err);
    return null;
  }
}
