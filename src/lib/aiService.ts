// ============================================================
// AI Evaluation Service
// Handles the AI recruiter conversation logic using OpenAI GPT.
// ============================================================

import OpenAI from "openai";
import { createClient as createServerClient } from "@supabase/supabase-js";
import { changeLeadStatus } from "@/lib/actions/changeLeadStatus";
import { LeadStatus, type LeadStatusValue } from "@/lib/stateMachine";

// ── OpenAI Client ────────────────────────────────────────────

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ── Supabase Admin Client ───────────────────────────────────

function getSupabase() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// ── Types ───────────────────────────────────────────────────

export type AIAction = "CONTINUE" | "ADVANCE_TO_FIT" | "REJECT";

export interface AIEvaluation {
  action: AIAction;
  reply: string;
  screening_score: number;
}

export interface ProcessMessageResult {
  success: boolean;
  aiReply?: string;
  action?: AIAction;
  error?: string;
}

interface DBMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  created_at: string;
}

interface LeadContext {
  name: string;
  phone: string | null;
  email: string | null;
  location: string | null;
  experience: string | null;
  age: number | null;
  job_title: string | null;
}

// ── System Prompt Builder ───────────────────────────────────

function buildSystemPrompt(lead: LeadContext): string {
  const knownFields: string[] = [];
  if (lead.name) knownFields.push(`שם: ${lead.name}`);
  if (lead.phone) knownFields.push(`טלפון: ${lead.phone}`);
  if (lead.email) knownFields.push(`אימייל: ${lead.email}`);
  if (lead.location) knownFields.push(`מיקום: ${lead.location}`);
  if (lead.experience) knownFields.push(`ניסיון: ${lead.experience}`);
  if (lead.age) knownFields.push(`גיל: ${lead.age}`);
  if (lead.job_title) knownFields.push(`תפקיד: ${lead.job_title}`);

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

=== הטבות ותנאים (נקודות מכירה מרכזיות) ===
1. מגורים מסובסדים: לכל העובדים, בכל התחומים. בלי לשלם מראש!
2. ארוחות: תפקידים רבים כוללים עד 3 ארוחות ביום.
3. נסיעות: הסעות חינם באילת.
4. בונוסים: שכר שעתי + מענקי התמדה + זכאות למענק עבודה מועדפת (לחיילים משוחררים).
5. גמישות: אפשרויות עבודה ללא שבתות וחגים, ואקסטרות (משמרות נוספות) למי שרוצה להרוויח יותר.

=== תחומים ותפקידים ===
1. מלונאות: קב"ט (אבטחה), אחזקה, מלצרים, טבחים, עוזרי טבחים, קונדיטורים, קבלה, בלנים (bell boy), ברמנים, עובדי בריכה, מצילים, חדרנים, סטיוארדים, צ'קרים, שירות אורחים, מנהלי מועדון ילדים, מפעילי מגלשות, תפקידי ניהול, עובדי מחסן.
2. אופנה (חנויות בגדים): יועצי מכירה, קופאים, עובדי מחסן, צוותי ניהול ומכירות למותגים מובילים.
3. קמעונאות (סופרמרקטים): קופאים, סדרנים, ירקנים, עובדי מעדנייה, קצבים, מלקטי הזמנות אונליין.
4. מכירות ואחר: דיילות קוסמטיקה, מכירות ביגוד ספורט, נציגי מרכז הזמנות מלונות.

=== איך לענות על שאלות מועמדים ===
- שאלה על מגורים/דיור/רילוקיישן → ענה בהתלהבות: "אנחנו מציעים מגורים מסובסדים לכל העובדים שלנו, בלי לשלם מראש! זה אחד היתרונות הכי גדולים שלנו."
- שאלה על אוכל/ארוחות → "הרבה מהתפקידים שלנו כוללים עד 3 ארוחות ביום."
- שאלה על נסיעות/הגעה → "יש הסעות חינם באילת לעובדים שלנו."
- שאלה על שכר/תנאים → "השכר שעתי, עם מענקי התמדה ואפשרות לאקסטרות. חיילים משוחררים זכאים גם למענק עבודה מועדפת."
- שאלה על שבת/חגים → "יש אפשרויות לעבודה ללא שבתות וחגים."
- שאלה על מיקום → "יש לנו משרות באילת, ים המלח, מצפה רמון, תל אביב ועוד."
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

=== כלל מיוחד: מלונאות + שומר שבת ===
אם מועמד/ת רוצה לעבוד במלונאות אבל לא יכול/ה לעבוד בשבת (שומר/ת שבת, ללא שבתות):
1. אל תציע תפקידי מלונאות רגילים. הסבר שעבודה במלונאות ללא שבת דורשת תיאום מיוחד.
2. הודע שיועץ השמה אנושי ייצור איתם קשר בהקדם כדי למצוא את ההתאמה המושלמת בתחום המלונאות.
3. שאל בנימוס אם בינתיים הם פתוחים לשמוע על משרות בסופרים או באופנה, כי שם קל יותר לעבוד ללא שבתות.
4. השתמש ב-"CONTINUE" כל עוד ממתינים לתשובה על התחומים החלופיים. השתמש ב-"ADVANCE_TO_FIT" אם הם מתעניינים בתחום חלופי.

=== גמישות בגיוס ===
- אנחנו חברת השמה — המטרה שלנו למצוא עבודה לכל מועמד/ת. אל תדחה מועמדים בגלל שהם מעוניינים בתחום אחר.
- אם המועמד/ת לא מעוניין/ת בתפקיד המקורי שלו/ה, או מביע/ה עניין בתחום אחר — הצע בחום את כל התחומים שלנו (מלונאות, אופנה, קמעונאות, מכירות) ושאל באיזה מהם הם מעדיפים.
- דחה מועמד/ת ("REJECT") רק אם הוא/היא מסרב/ת לכל האפשרויות שהצעת, או שהוא/היא לא זמין/ה לעבודה כלל.

=== פורמט תשובה ===
אחרי כל הודעה של המועמד/ת, החזר אובייקט JSON בלבד עם השדות הבאים:
{
  "action": "CONTINUE" | "ADVANCE_TO_FIT" | "REJECT",
  "reply": "<הודעה בעברית למועמד/ת>",
  "screening_score": <מספר 0-100>
}

כללים:
- "CONTINUE" — אם צריך עוד מידע מהמועמד/ת, או אם הצעת תחומים חלופיים וממתין לתשובה.
- "ADVANCE_TO_FIT" (ציון >= 60) — כשהמועמד/ת מעוניין/ת באחד התחומים שלנו ויש מספיק מידע.
- "REJECT" (ציון < 30) — רק כשהמועמד/ת בבירור לא מעוניין/ת באף אחד מהתחומים שלנו או לא זמין/ה לעבודה.
- screening_score משקף את הביטחון שלך במועמד/ת (0 = לא מתאים בכלל, 100 = מושלם).
- תמיד כלול תשובה ידידותית בעברית, גם בדחייה.
- החזר JSON תקין בלבד, בלי טקסט נוסף מחוץ ל-JSON.`;
}

// ── OpenAI LLM Call ─────────────────────────────────────────

async function callLLM(
  chatHistory: { role: string; content: string }[],
  leadContext: LeadContext
): Promise<AIEvaluation> {
  const systemPrompt = buildSystemPrompt(leadContext);

  // Strip any old system messages from history, inject the lead-aware prompt
  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...chatHistory
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
  ];

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.3,
    response_format: { type: "json_object" },
    messages,
  });

  const raw = response.choices[0]?.message?.content ?? "";
  return parseAIResponse(raw);
}

// ── Response Parser ─────────────────────────────────────────

function parseAIResponse(raw: string): AIEvaluation {
  const VALID_ACTIONS: AIAction[] = ["CONTINUE", "ADVANCE_TO_FIT", "REJECT"];
  const FALLBACK: AIEvaluation = {
    action: "CONTINUE",
    reply: "סליחה, נתקלתי בבעיה טכנית. אפשר לחזור על ההודעה האחרונה?",
    screening_score: 50,
  };

  try {
    const parsed = JSON.parse(raw);

    const action: AIAction = VALID_ACTIONS.includes(parsed.action)
      ? parsed.action
      : "CONTINUE";

    const reply =
      typeof parsed.reply === "string" && parsed.reply.trim().length > 0
        ? parsed.reply.trim()
        : FALLBACK.reply;

    const screening_score =
      typeof parsed.screening_score === "number" &&
      parsed.screening_score >= 0 &&
      parsed.screening_score <= 100
        ? parsed.screening_score
        : 50;

    return { action, reply, screening_score };
  } catch {
    console.error("Failed to parse AI response:", raw);
    return FALLBACK;
  }
}

// ── Main Processing Function ────────────────────────────────

export async function processIncomingMessage(
  leadId: string,
  messageText: string
): Promise<ProcessMessageResult> {
  const supabase = getSupabase();

  // 1. Fetch lead status + profile data for context
  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .select("status, name, phone, email, location, experience, age, job_title")
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

  // Build lead context for the AI
  const leadContext: LeadContext = {
    name: lead.name,
    phone: lead.phone ?? null,
    email: lead.email ?? null,
    location: lead.location ?? null,
    experience: lead.experience ?? null,
    age: lead.age ?? null,
    job_title: lead.job_title ?? null,
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
  const { error: insertUserError } = await supabase
    .from("messages")
    .insert({
      lead_id: leadId,
      role: "user",
      content: messageText,
    });

  if (insertUserError) {
    return { success: false, error: `שגיאה בשמירת ההודעה: ${insertUserError.message}` };
  }

  // 4. Build the chat history for the LLM (no system message — callLLM handles it)
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

  // 6. Save the AI reply
  const { error: insertAIError } = await supabase
    .from("messages")
    .insert({
      lead_id: leadId,
      role: "assistant",
      content: evaluation.reply,
    });

  if (insertAIError) {
    return { success: false, error: `שגיאה בשמירת תשובת AI: ${insertAIError.message}` };
  }

  // 7. If the AI decided to transition, use the Phase 1 state machine
  if (evaluation.action === "ADVANCE_TO_FIT") {
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
        error: `ההודעה נשמרה אך מעבר הסטטוס נכשל: ${result.error}`,
      };
    }
  }

  if (evaluation.action === "REJECT") {
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
        error: `ההודעה נשמרה אך מעבר הסטטוס נכשל: ${result.error}`,
      };
    }
  }

  return {
    success: true,
    aiReply: evaluation.reply,
    action: evaluation.action,
  };
}
