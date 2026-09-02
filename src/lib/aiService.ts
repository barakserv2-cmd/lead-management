// ============================================================
// AI Recruitment Agent v2
// Uses Anthropic Claude Sonnet 4.5 to drive WhatsApp screening
// conversations with leads. Returns a multi-dimensional
// evaluation plus structured fields extracted from the chat.
// ============================================================

import Anthropic from "@anthropic-ai/sdk";
import { createClient as createServerClient } from "@supabase/supabase-js";
import { changeLeadStatus } from "@/lib/actions/changeLeadStatus";
import { LeadStatus, type LeadStatusValue } from "@/lib/stateMachine";
import { botRejectEnabled } from "@/lib/botConfig";

// ── Anthropic Client (lazy) ──────────────────────────────────

const CLAUDE_MODEL = "claude-sonnet-4-5";

let _anthropic: Anthropic | null = null;
function getAnthropic(): Anthropic {
  if (!_anthropic) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error("ANTHROPIC_API_KEY is not configured");
    }
    _anthropic = new Anthropic({ apiKey });
  }
  return _anthropic;
}

// ── Supabase Admin Client ────────────────────────────────────

function getSupabase() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// ── Types ────────────────────────────────────────────────────

export type AIAction = "CONTINUE" | "ADVANCE_TO_FIT" | "REJECT" | "ESCALATE_TO_HUMAN";

/**
 * Reasons the agent may hand the conversation off to a human recruiter.
 * Keep this in sync with the system prompt.
 */
export type HumanEscalationReason =
  | "explicit_request"      // candidate asked to speak with a human
  | "distress"              // anger / confusion / complaint
  | "hotel_sabbath"         // wants hospitality role + Sabbath observer
  | "unlisted_job"          // wants a job we don't offer
  | "other";

export interface MultiScore {
  motivation: number;    // 0-100 — does the candidate want to work with us
  fit: number;           // 0-100 — match to our industries / roles
  availability: number;  // 0-100 — start date, hours, days available
  experience: number;    // 0-100 — relevant experience
}

export interface ExtractedFields {
  availability?: string;        // e.g. "מיידי, מלא, כולל סופ"ש"
  salary_expectation?: string;  // e.g. "45 ש"ח לשעה" / "8000 ברוטו"
  location_pref?: string;       // e.g. "אילת בלבד, מעוניין במגורים"
  interests?: string[];         // e.g. ["מלצרות", "ברמן"]
}

export interface AIEvaluation {
  action: AIAction;
  reply: string;
  screening_score: number;          // composite / weighted, 0-100
  scores: MultiScore;
  extracted: ExtractedFields;
  needs_human: boolean;
  human_reason?: HumanEscalationReason;
  human_reason_note?: string;       // free text reason from the model
}

export interface ProcessMessageResult {
  success: boolean;
  aiReply?: string;
  action?: AIAction;
  needs_human?: boolean;
  error?: string;
}

interface LeadContext {
  name: string;
  phone: string | null;
  email: string | null;
  location: string | null;
  experience: string | null;
  age: number | null;
  job_title: string | null;
  source?: string | null;
}

// ── Holding message (sent on escalation) ─────────────────────

const HUMAN_HOLDING_MESSAGE =
  "תודה רבה על הפנייה! אעביר את הפרטים שלך לרכזת הגיוס שלנו, והיא תחזור אליך בהקדם עם הצעות מותאמות אישית. 🙏";

// ── System Prompt Builder ────────────────────────────────────

function buildSystemPrompt(lead: LeadContext): string {
  const knownFields: string[] = [];
  if (lead.name) knownFields.push(`שם: ${lead.name}`);
  if (lead.phone) knownFields.push(`טלפון: ${lead.phone}`);
  if (lead.email) knownFields.push(`אימייל: ${lead.email}`);
  if (lead.location) knownFields.push(`מיקום: ${lead.location}`);
  if (lead.experience) knownFields.push(`ניסיון: ${lead.experience}`);
  if (lead.age) knownFields.push(`גיל: ${lead.age}`);
  if (lead.job_title) knownFields.push(`תפקיד: ${lead.job_title}`);
  if (lead.source) knownFields.push(`מקור הפנייה: ${lead.source}`);

  const knownInfo =
    knownFields.length > 0
      ? `מידע ידוע על המועמד/ת:\n${knownFields.join("\n")}`
      : "אין מידע מוקדם על המועמד/ת.";

  return `אתה מגייס AI של ברק שירותים (Barak Sherutim), חברת כוח אדם והשמה.
תפקידך לנהל שיחת גיוס חמה ומזמינה בעברית, ולמצוא למועמד/ת עבודה מתאימה מתוך המשרות שלנו.

=== מי אנחנו ===
ברק שירותים — חברת גיוס והשמה.
משרדים: שדרות התמרים 39, בניין פירסט קלאב, אילת.
אנחנו משבצים עובדים באילת, ים המלח, מצפה רמון, תל אביב ומקומות נוספים.
קהל יעד: צעירים, משוחררי צבא (עבודה מועדפת), וכל מי שמחפש עבודה עם מגורים.
התחלה מיידית, ללא התחייבות.

=== הטבות ותנאים ===
אוניברסלי — נכון לכל משרה של ברק שירותים, ומותר להבטיח בביטחון:
- מגורים מסובסדים: כל המשרות שלנו כוללות מגורים מסובסדים, בלי לשלם מראש. זו נקודת המכירה המרכזית.

תלוי-משרה — משתנה ממשרה למשרה, ואסור להבטיח או לנקוב במספרים:
- שכר: לכל משרה שכר משלה; בחלק מהמשרות נקבע בראיון.
- בונוסים ומענקים: ספציפיים למשרה. לדוגמה, למלצרים אין מענק התמדה.
- ארוחות: חלק מהתפקידים כוללים ארוחות, לא כולם.
- מענק עבודה מועדפת: רק לחיילים/ות משוחררים/ות, ורק במשרות שמוגדרות "עבודה מועדפת".
- נסיעות והסעות: משתנה לפי המשרה והמיקום.
כשנשאל על תנאי תלוי-משרה — אל תמציא מספרים או הבטחות. אמור שהתנאים המדויקים תלויים במשרה הספציפית, ושרכז/ת הגיוס ימסור/תמסור אותם בשיחת ההמשך.

=== תחומים ותפקידים (זוהי רשימת המשרות הסגורה שלנו) ===
1. מלונאות: קב"ט (אבטחה), אחזקה, מלצרים, טבחים, עוזרי טבחים, קונדיטורים, קבלה, בלנים (bell boy), ברמנים, עובדי בריכה, מצילים, חדרנים, סטיוארדים, צ'קרים, שירות אורחים, מנהלי מועדון ילדים, מפעילי מגלשות, תפקידי ניהול, עובדי מחסן.
2. אופנה (חנויות בגדים): יועצי מכירה, קופאים, עובדי מחסן, צוותי ניהול ומכירות למותגים מובילים.
3. קמעונאות (סופרמרקטים): קופאים, סדרנים, ירקנים, עובדי מעדנייה, קצבים, מלקטי הזמנות אונליין.
4. מכירות ואחר: דיילות קוסמטיקה, מכירות ביגוד ספורט, נציגי מרכז הזמנות מלונות.
**אם המועמד מבקש משרה/תפקיד שאינו ברשימה הזו — זהו "unlisted_job" וצריך להעביר למגייסת אנושית.**

=== איך לענות על שאלות מועמדים ===
- שאלה על מגורים/דיור/רילוקיישן → ענה בהתלהבות: "כל המשרות שלנו כוללות מגורים מסובסדים, בלי לשלם מראש! זה אחד היתרונות הכי גדולים שלנו."
- שאלה על שכר → "השכר משתנה לפי המשרה הספציפית, ובחלק מהמשרות נקבע בראיון. רכז/ת הגיוס ימסור/תמסור לך את הפרטים המדויקים." אל תנקוב בסכום.
- שאלה על בונוסים/מענקים → "יש משרות עם בונוסים ומענקים, וזה תלוי במשרה הספציפית — הרכז/ת ימסור/תמסור לך מה רלוונטי לתפקיד שיתאים לך." אל תבטיח מענק התמדה.
- שאלה על אוכל/ארוחות → "חלק מהתפקידים כוללים ארוחות — זה תלוי במשרה."
- שאלה על נסיעות/הגעה → "זה משתנה לפי המשרה והמיקום — הרכז/ת ימסור/תמסור פרטים."
- שאלה על שבת/חגים → "יש משרות עם וללא עבודה בשבת — נמצא לך משהו שמתאים."
- שאלה על מיקום → "יש לנו משרות באילת ובמקומות נוספים."
- אם המועמד/ת לא שואל על הטבות — אל תציף אותם במידע. תן מידע רק כשנשאל או כשזה קשור ישירות לשיחה.

${knownInfo}

=== הנחיות שיחה ===
- פנה למועמד/ת בשמם (${lead.name}) בצורה טבעית וחמה.
- אל תשאל על מידע שכבר יש לנו (מפורט למעלה).
- שאל על ניסיון תעסוקתי, זמינות, העדפת מיקום, וציפיות שכר — רק מה שעוד לא ידוע.
- היה מקצועי, תמציתי וידידותי. שדר התלהבות מהאפשרויות שלנו.
- דבר כמו מגייס אנושי חם ונעים, לא כמו רובוט. השתמש בעברית טבעית.
- נהל שיחה של 3-5 הודעות לפני קבלת החלטה.
- כל התשובות בעברית בלבד.

=== הודעת הפתיחה (ההודעה הראשונה בשיחה) ===
כשאין עדיין היסטוריית שיחה — זו הודעת הפתיחה, והיא קריטית:
- קצרה: 2-3 משפטים לכל היותר. בלי קירות טקסט, בלי רשימות הטבות.
- ציין מאיפה הגיעו הפרטים — ${lead.source ? `המקור האמיתי הוא "${lead.source}" וזה המקור היחיד שמותר להזכיר. **לעולם אל תמציא מקור אחר** (אם המקור "דף נחיתה" — אל תכתוב AllJobs).` : "אם המקור לא ידוע, אמור באופן כללי 'קיבלנו את הפרטים שלך' בלי לנקוב במקור."} האזכור הזה הוא מה שהופך את הפנייה ללגיטימית.
- אם ידוע התפקיד שביקשו — הזכר אותו. אם לא — שאל שאלת כיוון אחת.
- הזכר את המגורים המסובסדים במשפט אחד.
- **אסור לצרף קישורים בהודעת הפתיחה.** קישור (לתיאום ראיון) נשלח רק אחרי שהמועמד/ת ענה/תה לפחות פעם אחת.
- סיים תמיד בשאלה אחת פשוטה שמזמינה תשובה ("עדיין רלוונטי לך?", "איזה כיוון מעניין אותך?").
- אל תפרט רשימות תחומים בסוגריים בהודעת הפתיחה — שאלה פתוחה קצרה מספיקה; הפירוט יגיע בהמשך השיחה לפי הצורך.
- **חובה כשהמקור הוא "טלפון":** המועמד/ת התקשר/ה אלינו ולא נענה/תה — המשפט הראשון חייב להיות התנצלות על השיחה שפוספסה ("ראיתי שהתקשרת אלינו ולא הספקנו לענות — סליחה!"). בלי זה ההודעה מבלבלת.
- אם המקור הוא "אתר - צור קשר" — לא בטוח שמדובר במועמד/ת: פתח רך ושאל אם מחפשים עבודה.

=== שאלות פסילה מוקדמות (בשתי ההודעות הראשונות) ===
ברר בעדינות, מוקדם בשיחה, את שלושת התנאים האלה — ואל תמשיך לשאלות עומק לפני שהם סגורים:
1. גיל 18+ (אם הגיל לא ידוע ונשמע צעיר — שאל).
2. נכונות לעבוד באילת / לעבור לאילת (המגורים המסובסדים עוזרים כאן).
3. זמינות להתחלה בשבועות הקרובים.
מי שנופל על אחד מהם באופן ברור וסופי (קטין/ה, לא מוכן/ה לאילת בשום אופן, לא זמין/ה בכלל) → action="REJECT" עם הודעת פרידה מכבדת ומנומקת.

=== ⚠ העברה למגייסת אנושית — needs_human=true ===
תרים את הדגל ESCALATE_TO_HUMAN במקרים הבאים, ואל תמשיך לשאול שאלות:
1. **explicit_request** — המועמד/ת ביקש/ה מפורשות לדבר עם נציג/ה / מגייסת / מנהל/ת / "בן אדם אמיתי".
2. **distress** — סימני מצוקה, זעם, בלבול, או תלונה (לדוגמה: "אתם רובוט?", "תפסיקו לשלוח", "מה זה הבלאגן הזה").
3. **hotel_sabbath** — המועמד/ת רוצה לעבוד במלונאות אבל לא יכול/ה לעבוד בשבת (שומר/ת שבת, ללא שבתות).
4. **unlisted_job** — המועמד/ת מבקש/ת תפקיד שאינו ברשימה למעלה (למשל נהג, מהנדס, מורה, פקיד בנק, מתכנת וכו').
5. **other** — כל מקרה אחר שמרגיש שדורש מומחיות אנושית.

כשמרימים את הדגל:
- action = "ESCALATE_TO_HUMAN"
- needs_human = true
- human_reason = אחד מהערכים מעלה
- ב-reply שלח הודעת המתנה אדיבה: "תודה רבה על הפנייה! אעביר את הפרטים שלך לרכזת הגיוס שלנו, והיא תחזור אליך בהקדם עם הצעות מותאמות אישית."

=== גמישות בגיוס ===
- אנחנו חברת השמה — המטרה שלנו למצוא עבודה לכל מועמד/ת. אל תדחה מועמדים בגלל שהם מעוניינים בתחום אחר ברשימה.
- אם המועמד/ת לא מעוניין/ת בתפקיד המקורי שלו/ה, אבל מביע/ה עניין בתחום אחר מהרשימה — הצע בחום את אותם תחומים.
- דחה ("REJECT") רק אם המועמד/ת מסרב/ת לכל האפשרויות שהצעת, או שהוא/היא לא זמין/ה לעבודה כלל.
- שים לב: בקשה לתפקיד שלא ברשימה איננה REJECT — היא ESCALATE_TO_HUMAN.

=== מיצוי שדות מובנים (extracted) ===
לאורך השיחה, חלץ מידע מובנה מהמועמד/ת ושמור אותו בשדה extracted:
- availability: זמינות (למשל "מיידי, משרה מלאה", "החל מ-1.6", "רק בקרים").
- salary_expectation: ציפיות שכר (למשל "45 ש"ח לשעה", "8000 ברוטו").
- location_pref: העדפת מיקום (למשל "אילת בלבד", "מוכן/ה לעבור אם יש מגורים").
- interests: רשימה של תחומים/תפקידים שמעניינים את המועמד/ת (למשל ["מלצרות", "ברמן"]).
החזר רק שדות שהמועמד/ת אכן מסר/ה. אל תמציא.

=== ניקוד רב-ממדי (scores, 0-100 כל אחד) ===
- motivation: עד כמה המועמד/ת באמת רוצה לעבוד אצלנו (התלהבות, אורך תשובות, יוזמה).
- fit: עד כמה המועמד/ת מתאים/ה לתחומים שלנו.
- availability: עד כמה הזמינות שלו/ה תואמת את הצרכים שלנו.
- experience: רלוונטיות הניסיון.
בנוסף, החזר screening_score = ציון מצרפי משוקלל (לרוב הממוצע, אבל אתה יכול לתת משקל יתר ל-motivation או fit אם רלוונטי).

=== פורמט תשובה ===
החזר אובייקט JSON בלבד עם השדות הבאים, ללא טקסט מחוץ ל-JSON:
{
  "action": "CONTINUE" | "ADVANCE_TO_FIT" | "REJECT" | "ESCALATE_TO_HUMAN",
  "reply": "<הודעה בעברית למועמד/ת>",
  "screening_score": <0-100>,
  "scores": {
    "motivation":   <0-100>,
    "fit":          <0-100>,
    "availability": <0-100>,
    "experience":   <0-100>
  },
  "extracted": {
    "availability":        "<טקסט או השמט>",
    "salary_expectation":  "<טקסט או השמט>",
    "location_pref":       "<טקסט או השמט>",
    "interests":           ["<תחום1>", "<תחום2>"]
  },
  "needs_human": <true|false>,
  "human_reason": "explicit_request" | "distress" | "hotel_sabbath" | "unlisted_job" | "other",
  "human_reason_note": "<משפט אחד שמסביר למה הועבר לאנושי, אם רלוונטי>"
}

⚠ קישורים: לעולם אל תכתוב קישור, כתובת אתר, או placeholder כמו "[קישור]".
כשאתה מסיים סינון בהצלחה (ADVANCE_TO_FIT) — המערכת שולחת אוטומטית את
קישור תיאום הראיון בהודעה נפרדת מיד אחרי ההודעה שלך. אמור בפשטות:
"אני שולח לך עכשיו קישור לבחירת מועד לראיון טלפוני קצר" — ותו לא.

כללי ההחלטה ל-action:
- "CONTINUE" — צריך עוד מידע, או הצעת תחומים חלופיים וממתין לתשובה.
- "ADVANCE_TO_FIT" — screening_score ≥ 60 והמועמד/ת מעוניין/ת באחד התחומים מהרשימה.
- "REJECT" — screening_score < 30 והמועמד/ת לא מעוניין/ת באף אחד מהתחומים שלנו או לא זמין/ה.
- "ESCALATE_TO_HUMAN" — אחד מהמקרים שתוארו למעלה. במצב זה, needs_human=true.
תמיד החזר JSON תקין בלבד.`;
}

// ── Anthropic LLM Call ───────────────────────────────────────

async function callLLM(
  chatHistory: { role: string; content: string }[],
  leadContext: LeadContext
): Promise<AIEvaluation> {
  const systemPrompt = buildSystemPrompt(leadContext);

  // Anthropic requires: messages must start with user and strictly alternate
  // user/assistant. Map outbound roles ("assistant" from AI replies,
  // "recruiter" from manual sends or cron reminders) to "assistant".
  // Then drop leading assistant messages and merge consecutive same-role runs.
  const mapped = chatHistory
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: (m.role === "assistant" || m.role === "recruiter"
        ? "assistant"
        : "user") as "user" | "assistant",
      content: m.content,
    }));

  const firstUser = mapped.findIndex((m) => m.role === "user");
  const trimmed = firstUser === -1 ? [] : mapped.slice(firstUser);

  const messages: { role: "user" | "assistant"; content: string }[] = [];
  for (const m of trimmed) {
    const last = messages[messages.length - 1];
    if (last && last.role === m.role) {
      last.content = `${last.content}\n\n${m.content}`;
    } else {
      messages.push({ ...m });
    }
  }

  const response = await getAnthropic().messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 1024,
    temperature: 0.3,
    system: systemPrompt,
    messages,
  });

  // Concatenate text blocks (avoid SDK-specific TextBlock type name)
  const raw = response.content
    .map((block) => (block.type === "text" ? block.text : ""))
    .join("")
    .trim();

  return parseAIResponse(raw);
}

// ── Response Parser ──────────────────────────────────────────

const VALID_ACTIONS: AIAction[] = [
  "CONTINUE",
  "ADVANCE_TO_FIT",
  "REJECT",
  "ESCALATE_TO_HUMAN",
];

const VALID_REASONS: HumanEscalationReason[] = [
  "explicit_request",
  "distress",
  "hotel_sabbath",
  "unlisted_job",
  "other",
];

const FALLBACK_EVAL: AIEvaluation = {
  action: "CONTINUE",
  reply: "סליחה, נתקלתי בבעיה טכנית. אפשר לחזור על ההודעה האחרונה?",
  screening_score: 50,
  scores: { motivation: 50, fit: 50, availability: 50, experience: 50 },
  extracted: {},
  needs_human: false,
};

function clamp100(n: unknown, fallback = 50): number {
  return typeof n === "number" && n >= 0 && n <= 100 ? Math.round(n) : fallback;
}

function parseAIResponse(raw: string): AIEvaluation {
  // Strip optional ```json fences
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  try {
    const parsed = JSON.parse(cleaned);

    const action: AIAction = VALID_ACTIONS.includes(parsed.action)
      ? parsed.action
      : "CONTINUE";

    const reply =
      typeof parsed.reply === "string" && parsed.reply.trim().length > 0
        ? parsed.reply.trim()
        : FALLBACK_EVAL.reply;

    const screening_score = clamp100(parsed.screening_score);

    const s = parsed.scores ?? {};
    const scores: MultiScore = {
      motivation:   clamp100(s.motivation),
      fit:          clamp100(s.fit),
      availability: clamp100(s.availability),
      experience:   clamp100(s.experience),
    };

    const e = parsed.extracted ?? {};
    const extracted: ExtractedFields = {};
    if (typeof e.availability === "string" && e.availability.trim()) {
      extracted.availability = e.availability.trim();
    }
    if (typeof e.salary_expectation === "string" && e.salary_expectation.trim()) {
      extracted.salary_expectation = e.salary_expectation.trim();
    }
    if (typeof e.location_pref === "string" && e.location_pref.trim()) {
      extracted.location_pref = e.location_pref.trim();
    }
    if (Array.isArray(e.interests)) {
      const interests = e.interests
        .filter((x: unknown): x is string => typeof x === "string" && x.trim().length > 0)
        .map((x: string) => x.trim());
      if (interests.length > 0) extracted.interests = interests;
    }

    const needs_human =
      action === "ESCALATE_TO_HUMAN" || parsed.needs_human === true;

    const human_reason: HumanEscalationReason | undefined =
      needs_human && VALID_REASONS.includes(parsed.human_reason)
        ? parsed.human_reason
        : needs_human
          ? "other"
          : undefined;

    const human_reason_note =
      typeof parsed.human_reason_note === "string"
        ? parsed.human_reason_note.trim() || undefined
        : undefined;

    return {
      action: needs_human ? "ESCALATE_TO_HUMAN" : action,
      reply,
      screening_score,
      scores,
      extracted,
      needs_human,
      human_reason,
      human_reason_note,
    };
  } catch {
    console.error("Failed to parse AI response:", raw);
    return FALLBACK_EVAL;
  }
}

// ── Persistence helpers ──────────────────────────────────────

/**
 * Patches the lead row with whatever fields the agent extracted this turn,
 * plus the latest score breakdown. Only non-null fields are written.
 */
async function persistAgentUpdate(
  supabase: ReturnType<typeof getSupabase>,
  leadId: string,
  evaluation: AIEvaluation
): Promise<void> {
  const patch: Record<string, unknown> = {
    screening_motivation_score:   evaluation.scores.motivation,
    screening_fit_score:          evaluation.scores.fit,
    screening_availability_score: evaluation.scores.availability,
    screening_experience_score:   evaluation.scores.experience,
  };

  if (evaluation.extracted.availability) {
    patch.extracted_availability = evaluation.extracted.availability;
  }
  if (evaluation.extracted.salary_expectation) {
    patch.extracted_salary_expectation = evaluation.extracted.salary_expectation;
  }
  if (evaluation.extracted.location_pref) {
    patch.extracted_location_pref = evaluation.extracted.location_pref;
  }
  if (evaluation.extracted.interests && evaluation.extracted.interests.length > 0) {
    patch.extracted_interests = evaluation.extracted.interests;
  }

  if (evaluation.needs_human) {
    patch.needs_human_attention = true;
    patch.human_attention_reason =
      evaluation.human_reason_note ?? humanReasonLabel(evaluation.human_reason);
    patch.human_attention_raised_at = new Date().toISOString();

    // הקצאה אוטומטית: לכל דגל יש שם מהרגע הראשון — הליד מופיע בטור של
    // רכזת ספציפית במסך היום, לא ב"מגרש הציבורי" שאף אחת לא מרגישה
    // אחראית עליו.
    const assignee = await pickEscalationRecruiter(supabase);
    if (assignee) {
      patch.handled_by = assignee;
      patch.handled_at = new Date().toISOString();
    }
  }

  const { error } = await supabase.from("leads").update(patch).eq("id", leadId);
  if (error) {
    console.error(`[aiService] Failed to persist agent update for ${leadId}:`, error.message);
  }
}

/**
 * סבב הקצאת הסלמות: הרכזת הפעילה (עם וואטסאפ מקושר) שקיבלה הכי מעט
 * דגלים היום. אין רכזות מקושרות → null והליד נשאר לא-משויך.
 */
async function pickEscalationRecruiter(
  supabase: ReturnType<typeof getSupabase>
): Promise<string | null> {
  const { data: accounts } = await supabase
    .from("whatsapp_accounts")
    .select("user_email")
    .eq("is_active", true);
  const recruiters = Array.from(
    new Set((accounts ?? []).map((a) => String(a.user_email).toLowerCase()))
  );
  if (recruiters.length === 0) return null;
  if (recruiters.length === 1) return recruiters[0];

  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);
  const { data: todays } = await supabase
    .from("leads")
    .select("handled_by")
    .eq("needs_human_attention", true)
    .gte("human_attention_raised_at", dayStart.toISOString());

  const counts = new Map<string, number>(recruiters.map((r) => [r, 0]));
  for (const row of todays ?? []) {
    const k = String(row.handled_by ?? "").toLowerCase();
    if (counts.has(k)) counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  let best = recruiters[0];
  for (const r of recruiters) {
    if ((counts.get(r) ?? 0) < (counts.get(best) ?? 0)) best = r;
  }
  return best;
}

function humanReasonLabel(reason?: HumanEscalationReason): string {
  switch (reason) {
    case "explicit_request": return "המועמד/ת ביקש/ה לדבר עם נציג/ה אנושי/ת";
    case "distress":         return "זוהו סימני מצוקה בשיחה";
    case "hotel_sabbath":    return "מלונאות + שמירת שבת — דורש תיאום אנושי";
    case "unlisted_job":     return "ביקש/ה תפקיד שאינו ברשימת המשרות שלנו";
    case "other":            return "השיחה דורשת מגייס/ת אנושי/ת";
    default:                 return "דורש תשומת לב אנושית";
  }
}

// ── Main Processing Function ─────────────────────────────────

export async function processIncomingMessage(
  leadId: string,
  messageText: string,
  /** Green API instance the conversation runs on (stamped on saved messages) */
  viaInstance: string | null = null
): Promise<ProcessMessageResult> {
  const supabase = getSupabase();

  // 1. Fetch lead status + profile data + escalation flag
  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .select(
      "status, name, phone, email, location, experience, age, job_title, source, needs_human_attention"
    )
    .eq("id", leadId)
    .single();

  if (leadError || !lead) {
    return { success: false, error: `ליד לא נמצא: ${leadId}` };
  }

  const currentStatus = lead.status as LeadStatusValue;

  // Only process messages for leads in screening
  if (currentStatus !== LeadStatus.SCREENING_IN_PROGRESS) {
    return {
      success: false,
      error: `הליד במצב ${currentStatus} — הסינון פעיל רק במצב SCREENING_IN_PROGRESS`,
    };
  }

  // Already escalated — save the message but don't auto-reply.
  // A human is on the hook; we don't want the bot interrupting.
  if (lead.needs_human_attention) {
    await supabase.from("messages").insert({
      lead_id: leadId,
      role: "user",
      content: messageText,
      via_instance: viaInstance,
    });
    return {
      success: true,
      needs_human: true,
      error: "השיחה הועברה למגייס/ת אנושי/ת — הסוכן לא משיב",
    };
  }

  // Build lead context for the AI
  const leadContext: LeadContext = {
    name: lead.name,
    phone: lead.phone ?? null,
    email: lead.email ?? null,
    location: lead.location ?? null,
    experience: lead.experience ?? null,
    age: lead.age ?? null,
    job_title: lead.job_title ?? null,
    source: lead.source ?? null,
  };

  // 2. Fetch existing chat history
  const { data: existingMessages, error: historyError } = await supabase
    .from("messages")
    .select("role, content, created_at")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: true });

  if (historyError) {
    return { success: false, error: `שגיאה בטעינת ההיסטוריה: ${historyError.message}` };
  }

  // 3. Save the incoming user message
  const { error: insertUserError } = await supabase.from("messages").insert({
    lead_id: leadId,
    role: "user",
    content: messageText,
    via_instance: viaInstance,
  });

  if (insertUserError) {
    return { success: false, error: `שגיאה בשמירת ההודעה: ${insertUserError.message}` };
  }

  // 4. Build chat history for the LLM
  const chatHistory = [
    ...(existingMessages ?? []).map((m) => ({
      role: m.role as string,
      content: m.content as string,
    })),
    { role: "user", content: messageText },
  ];

  // 5. Call the AI
  let evaluation: AIEvaluation;
  try {
    evaluation = await callLLM(chatHistory, leadContext);
  } catch (err) {
    return {
      success: false,
      error: `שגיאה בקריאה ל-AI: ${err instanceof Error ? err.message : "unknown"}`,
    };
  }

  // 5b. דחייה זהירה (ברירת המחדל בחודש הראשון): הבוט לא סוגר ליד לבד —
  //     כל REJECT הופך להעברה לרכזת עם הסבר, עד ש-BOT_REJECT_ENABLED=true.
  if (evaluation.action === "REJECT" && !botRejectEnabled()) {
    evaluation.action = "ESCALATE_TO_HUMAN";
    evaluation.needs_human = true;
    evaluation.human_reason = "other";
    evaluation.human_reason_note = `הבוט המליץ לדחות (ציון ${evaluation.screening_score}/100) — לבדיקת רכזת לפני סגירה`;
  }

  // 6. On escalation, override the reply with the canonical holding message
  //    (so we don't accidentally promise things the human hasn't decided).
  if (evaluation.needs_human) {
    evaluation.reply = HUMAN_HOLDING_MESSAGE;
  }

  // 7. Save the AI reply
  const { error: insertAIError } = await supabase.from("messages").insert({
    lead_id: leadId,
    role: "assistant",
    content: evaluation.reply,
    via_instance: viaInstance,
  });

  if (insertAIError) {
    return { success: false, error: `שגיאה בשמירת תשובת AI: ${insertAIError.message}` };
  }

  // 8. Persist scores + extracted fields + escalation flag to the lead row
  await persistAgentUpdate(supabase, leadId, evaluation);

  // 9. Status transitions (skip when escalating — leave the lead in SCREENING
  //    so the human picks it up from the same column)
  if (!evaluation.needs_human && evaluation.action === "ADVANCE_TO_FIT") {
    const result = await changeLeadStatus({
      leadId,
      newStatus: LeadStatus.FIT_FOR_INTERVIEW,
      userId: "ai-recruiter",
      notes: `סינון AI הושלם — ציון ${evaluation.screening_score}/100`,
      extra: {
        screeningScore: evaluation.screening_score,
      },
    });

    if (!result.success) {
      return {
        success: true,
        aiReply: evaluation.reply,
        action: evaluation.action,
        needs_human: false,
        error: `ההודעה נשמרה אך מעבר הסטטוס נכשל: ${result.error}`,
      };
    }
  }

  if (!evaluation.needs_human && evaluation.action === "REJECT") {
    const result = await changeLeadStatus({
      leadId,
      newStatus: LeadStatus.REJECTED,
      userId: "ai-recruiter",
      notes: `נדחה ע"י סינון AI — ציון ${evaluation.screening_score}/100`,
      extra: {
        rejectionReason: "לא מתאים",
      },
    });

    if (!result.success) {
      return {
        success: true,
        aiReply: evaluation.reply,
        action: evaluation.action,
        needs_human: false,
        error: `ההודעה נשמרה אך מעבר הסטטוס נכשל: ${result.error}`,
      };
    }
  }

  return {
    success: true,
    aiReply: evaluation.reply,
    action: evaluation.action,
    needs_human: evaluation.needs_human,
  };
}

// ── Shadow mode ──────────────────────────────────────────────

/**
 * מצב צל: מנסח את הודעת הפתיחה שהבוט *היה* שולח לליד — בלי לכתוב
 * כלום: לא הודעות, לא ציונים, לא סטטוסים. רק קריאה + LLM.
 */
export async function generateShadowWelcome(
  leadId: string
): Promise<{ success: boolean; evaluation?: AIEvaluation; error?: string }> {
  const supabase = getSupabase();

  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .select("name, phone, email, location, experience, age, job_title, source")
    .eq("id", leadId)
    .single();
  if (leadError || !lead) {
    return { success: false, error: `ליד לא נמצא: ${leadId}` };
  }

  const leadContext: LeadContext = {
    name: lead.name,
    phone: lead.phone ?? null,
    email: lead.email ?? null,
    location: lead.location ?? null,
    experience: lead.experience ?? null,
    age: lead.age ?? null,
    job_title: lead.job_title ?? null,
    source: lead.source ?? null,
  };

  try {
    // אותה הודעה סינתטית שמניעה את הפתיחה במצב live (whatsappWelcome)
    const evaluation = await callLLM(
      [{ role: "user", content: "היי, אני מעוניין/ת בעבודה" }],
      leadContext
    );
    return { success: true, evaluation };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "unknown",
    };
  }
}
