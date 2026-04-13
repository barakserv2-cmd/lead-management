import Anthropic from "@anthropic-ai/sdk";
import type { AIParseResult } from "@/types/leads";
import { extractPhone, extractEmail } from "@/lib/gmail";

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

const SYSTEM_PROMPT = `אתה מערכת לזיהוי וחילוץ מידע על לידים (מועמדים לעבודה) מאימיילים.

קיבלת אימייל שיכול להיות מכל מקור (AllJobs, אימייל ישיר, סוכנות כוח אדם, וכו').

**שלב 1: זיהוי** - קבע אם האימייל מכיל פרטי ליד/מועמד (שם, טלפון, מיקום, גיל, ניסיון וכו'). אימיילים שיווקיים, ניוזלטרים, התראות מערכת, ואימיילים אישיים שאינם קשורים לגיוס - אינם לידים.

**שלב 2: חילוץ** - אם זהו ליד, חלץ את המידע הבא:

- is_lead: true אם האימייל מכיל פרטי מועמד, false אחרת
- name: שם מלא של המועמד
- phone: מספר טלפון (פורמט ישראלי, למשל 050-1234567)
- email: כתובת אימייל של המועמד (לא של אתר הדרושים)
- location: מיקום / עיר מגורים
- experience: ניסיון או תחום עיסוק
- age: גיל (מספר בלבד, או null אם לא זמין)
- job_title: שם המשרה אליה הוגשה המועמדות
- confidence: ציון ביטחון מ-0 עד 1 עבור איכות החילוץ הכוללת

החזר אך ורק JSON תקין, ללא טקסט נוסף. אם שדה לא נמצא, החזר null.

דוגמה לליד:
{"is_lead":true,"name":"דוד כהן","phone":"050-1234567","email":"david@gmail.com","location":"תל אביב","experience":"הנדסת תוכנה 5 שנים","age":30,"job_title":"מהנדס תוכנה","confidence":0.9}

דוגמה לאימייל שאינו ליד:
{"is_lead":false,"name":null,"phone":null,"email":null,"location":null,"experience":null,"age":null,"job_title":null,"confidence":0}`;

// Fast parser for Facebook/Zapier leads (consistent format: answer, name, phone, email, location)
function parseFbJobsLead(emailText: string): AIParseResult | null {
  // Clean up: remove Zapier footer and trim
  const cleanText = emailText
    .split("---")[0]
    .trim();

  const lines = cleanText
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  // FB leads typically have 3-5 short lines: answer (כן/לא), name, phone, email, location
  if (lines.length < 2 || lines.length > 8) return null;

  const phoneRe = /(?:\+972|0)[2-9]\d{7,8}/;
  const emailRe = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/;

  let name: string | null = null;
  let phone: string | null = null;
  let email: string | null = null;
  let location: string | null = null;

  for (const line of lines) {
    if (phoneRe.test(line) && !phone) {
      phone = line.match(phoneRe)![0];
      // Normalize +972 to 0
      if (phone.startsWith("+972")) {
        phone = "0" + phone.slice(4);
      }
    } else if (emailRe.test(line) && !email) {
      email = line.match(emailRe)![0];
    } else if (/^(כן|לא|yes|no)$/i.test(line)) {
      // Skip yes/no answer lines
      continue;
    } else if (!name && line.length >= 2 && line.length <= 60 && !/^http/.test(line)) {
      name = line;
    } else if (name && !location && line.length >= 2 && line.length <= 40 && !phoneRe.test(line) && !emailRe.test(line) && !/^http/.test(line)) {
      location = line;
    }
  }

  if (!name || !phone) return null;

  return {
    is_lead: true,
    name,
    phone,
    email,
    location,
    experience: null,
    age: null,
    job_title: null,
    confidence: 0.85,
  };
}

export async function parseEmailWithAI(
  emailText: string,
  subject: string,
  from?: string
): Promise<AIParseResult> {
  // Fast path: detect FB Jobs leads by subject and parse without AI
  if (/NEW LEAD FROM FB JOBS/i.test(subject)) {
    const fbResult = parseFbJobsLead(emailText);
    if (fbResult) {
      console.log(`[FB Parser] Extracted: ${fbResult.name}, ${fbResult.phone}`);
      return fbResult;
    }
  }

  try {
    const message = await getAnthropic().messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `${from ? `מאת: ${from}\n` : ""}נושא: ${subject}\n\nגוף המייל:\n${emailText}`,
        },
      ],
    });

    const responseText =
      message.content[0].type === "text" ? message.content[0].text : "";

    // Extract JSON from response (handle potential markdown wrapping)
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn("AI response did not contain valid JSON, falling back to regex");
      return regexFallback(emailText, subject);
    }

    const parsed = JSON.parse(jsonMatch[0]);
    return {
      is_lead: parsed.is_lead === true,
      name: parsed.name || null,
      phone: parsed.phone || null,
      email: parsed.email || null,
      location: parsed.location || null,
      experience: parsed.experience || null,
      age: parsed.age ? Number(parsed.age) : null,
      job_title: parsed.job_title || null,
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.5,
    };
  } catch (error) {
    console.error("AI parsing failed, falling back to regex:", error);
    return regexFallback(emailText, subject);
  }
}

const SUBJECT_RE = /מועמדות חדשה מ(.+?)\s+למשרת\s+(.+)/;

const AGE_PATTERNS = [
  /תאריך\s*לי[דר]\s*ה?\s*[:]\s*(\d{1,2})[./](\d{1,2})[./](\d{2,4})/,
  /גיל\s*[:]\s*(\d{2})/,
  /(?:בן|בת)\s+(\d{2})\b/,
];

function extractAge(text: string): number | null {
  // Try birth date
  const birthMatch = text.match(AGE_PATTERNS[0]);
  if (birthMatch) {
    let year = parseInt(birthMatch[3]);
    if (year < 100) year += 1900;
    if (year < 1950) year += 100;
    const age = new Date().getFullYear() - year;
    if (age > 0 && age < 120) return age;
  }

  // Try direct age
  const directMatch = text.match(AGE_PATTERNS[1]);
  if (directMatch) {
    const age = parseInt(directMatch[1]);
    if (age > 0 && age < 120) return age;
  }

  // Try ben/bat pattern
  const benBatMatch = text.match(AGE_PATTERNS[2]);
  if (benBatMatch) {
    const age = parseInt(benBatMatch[1]);
    if (age > 0 && age < 120) return age;
  }

  return null;
}

function extractLocation(text: string): string | null {
  const locationPatterns = [
    /(?:מיקום|עיר|מגורים|גר ב|גרה ב|מתגורר ב)\s*[:]\s*(.+)/,
    /(?:מיקום|עיר|מגורים)\s*[:]\s*(.+)/,
  ];
  for (const pattern of locationPatterns) {
    const match = text.match(pattern);
    if (match) return match[1].trim().split("\n")[0];
  }
  return null;
}

function regexFallback(emailText: string, subject: string): AIParseResult {
  const subjectMatch = subject.match(SUBJECT_RE);
  const name = subjectMatch ? subjectMatch[1].trim() : null;
  const job_title = subjectMatch ? subjectMatch[2].trim() : null;
  const phone = extractPhone(emailText);

  // If regex can extract a name or phone, treat as a potential lead
  const hasLeadSignals = !!(name || phone);

  return {
    is_lead: hasLeadSignals,
    name: name || "לא ידוע",
    phone,
    email: extractEmail(emailText),
    location: extractLocation(emailText),
    experience: null,
    age: extractAge(emailText),
    job_title,
    confidence: 0.3,
  };
}
