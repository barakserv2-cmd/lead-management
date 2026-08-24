// ============================================================
// /api/publishing/generate — writes the Hebrew ad copy.
//
// Produces one base post plus N rewrites. The rewrites are not decoration:
// each group in the queue gets a different one, because Facebook's spam
// scoring punishes the same text pasted across groups, and members of two
// overlapping Eilat job groups notice a copy-paste immediately.
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { admin, bad, currentUser, unauthorized } from "@/lib/publishingAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Opus writes a base post + N rewrites in one call; measured ~32s for 3
// variants, so 60s left no headroom at the top of the allowed range.
export const maxDuration = 120;

const SYSTEM_PROMPT = `את/ה קופירייטר/ית של "ברק שירותים" — סוכנות גיוס והשמה לאירוח ותיירות באילת (מלונות, מסעדות, ברים, קמעונאות).
המשימה: לכתוב מודעת דרושים אורגנית לקבוצות "דרושים" בפייסבוק.

═══ קהל היעד ═══
ישראלים צעירים: אחרי צבא, אחרי בגרות, מחפשי עבודה עונתית/שנתית באילת. גוללים בנייד, במהירות.

═══ כללי כתיבה ═══
• עברית בלבד. משפטים קצרים. שורה = רעיון.
• פותחים בשורת הוק שעוצרת גלילה — לא ב"דרוש/ה עובד/ה למסעדה".
• הטבה קונקרטית לפני דרישות. כסף, דיור, התחלה מיידית — מה שרלוונטי.
• 3–5 בולטים מקסימום. אימוג'ים בשימוש מדוד (1 לשורת בולט לכל היותר).
• פנייה בלשון זכר ונקבה (מלצרים/ות).
• אורך: 60–120 מילים. פוסט ארוך מדי לא נקרא בקבוצה.
• בלי סופרלטיבים ריקים ("הזדמנות שלא תחזור", "המשרה הכי טובה בארץ").
• בלי הבטחות שאי אפשר לעמוד בהן (שכר מדויק/דיור חינם) אלא אם נמסרו בנתונים.
• אל תמציא/י שמות מעסיקים, סכומים, מספרי טלפון או קישורים. אם נתון חסר — כתוב/כתבי בלעדיו.

═══ מיקום ה-CTA ═══
אל תוסיף/י בסוף קישור, טלפון או "קוד משרה" — המערכת מוסיפה אותם אוטומטית לכל קבוצה בנפרד.
סיים/י בשורת הנעה קצרה בלבד ("מתאים לך? כתבו לנו ונחזור אליכם היום").

═══ וריאציות ═══
כל וריאציה = מודעה עצמאית עם הוק אחר, סדר אחר וניסוח אחר — לא שכתוב מילים נרדפות.
זווית לדוגמה: כסף / דיור / התחלה מיידית / בלי ניסיון / חיים באילת / שקט תעשייתי מול הים.

החזר/י את התוצאה דרך הכלי submit_post בלבד.`;

// Structured output via a forced tool call. The obvious alternative — asking
// for raw JSON and prefilling the assistant turn with "{" — is rejected by
// claude-opus-5 ("This model does not support assistant message prefill"), and
// free-form JSON in a reply is fragile once the copy itself contains quotes.
const POST_TOOL = {
  name: "submit_post",
  description: "מוסר/ת את המודעה שנכתבה ואת הוריאציות שלה.",
  input_schema: {
    type: "object" as const,
    properties: {
      title: { type: "string", description: "כותרת פנימית קצרה לזיהוי במערכת (לא חלק מהמודעה)" },
      body: { type: "string", description: "המודעה הראשית, מוכנה להדבקה" },
      variants: {
        type: "array",
        description: "מודעות חלופיות — כל אחת עם הוק וניסוח שונים לגמרי",
        items: {
          type: "object",
          properties: {
            label: { type: "string", description: "הזווית בשתיים-שלוש מילים" },
            body: { type: "string" },
          },
          required: ["label", "body"],
        },
      },
    },
    required: ["title", "body", "variants"],
  },
};

interface GenerateBody {
  role_key?: string;
  job_id?: string;
  angle?: string;
  /** how many rewrites in addition to the base post */
  variants?: number;
  /** free-text brief from the recruiter */
  brief?: string;
}

interface GeneratedPost {
  title: string;
  body: string;
  variants: { label: string; body: string }[];
}

export async function POST(req: NextRequest) {
  const user = await currentUser();
  if (!user) return unauthorized();
  if (!process.env.ANTHROPIC_API_KEY) return bad("ANTHROPIC_API_KEY לא מוגדר", 500);

  const b = (await req.json()) as GenerateBody;
  const variantCount = Math.min(Math.max(b.variants ?? 3, 0), 8);

  const db = admin();
  const [{ data: role }, { data: job }] = await Promise.all([
    b.role_key
      ? db.from("fb_role_templates").select("*").eq("role_key", b.role_key).maybeSingle()
      : Promise.resolve({ data: null }),
    b.job_id
      ? db
          .from("jobs")
          .select("title, pay_rate, location, requirements, urgent, notes, clients(name)")
          .eq("id", b.job_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  if (!role && !job && !b.brief?.trim()) return bad("צריך תפקיד, משרה או תיאור חופשי");

  // Only facts that actually exist reach the model — it is told not to invent
  // the rest (no made-up salaries or employer names).
  const facts: string[] = [];
  if (role) {
    facts.push(`תפקיד: ${role.role_label}`);
    if (role.headline) facts.push(`כותרת ברירת מחדל: ${role.headline}`);
    if (role.requirements?.length) facts.push(`דרישות רגילות: ${role.requirements.join(", ")}`);
  }
  if (job) {
    const client = (job as { clients?: { name?: string } | null }).clients;
    facts.push(`משרה במערכת: ${job.title}`);
    if (client?.name) facts.push(`מעסיק: ${client.name}`);
    if (job.pay_rate) facts.push(`שכר: ${job.pay_rate}`);
    if (job.location) facts.push(`מיקום: ${job.location}`);
    if (job.requirements?.length) facts.push(`דרישות: ${(job.requirements as string[]).join(", ")}`);
    if (job.urgent) facts.push("המשרה דחופה — התחלה מיידית");
    if (job.notes) facts.push(`הערות: ${job.notes}`);
  }
  if (b.angle) facts.push(`זווית מבוקשת לפוסט הראשי: ${b.angle}`);
  if (b.brief?.trim()) facts.push(`בקשה מהרכזת: ${b.brief.trim()}`);

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  let parsed: GeneratedPost;
  try {
    const message = await anthropic.messages.create({
      model: "claude-opus-5",
      max_tokens: 4000,
      system: SYSTEM_PROMPT,
      tools: [POST_TOOL],
      tool_choice: { type: "tool", name: POST_TOOL.name },
      messages: [
        {
          role: "user",
          content: `כתוב/כתבי מודעת דרושים + ${variantCount} וריאציות.\n\nנתונים:\n${facts.join("\n")}`,
        },
      ],
    });

    const block = message.content.find((c) => c.type === "tool_use");
    if (!block || block.type !== "tool_use") {
      console.error("[publishing/generate] no tool_use in reply", message.stop_reason);
      return bad("המודל לא החזיר מודעה. נסה/י שוב.", 502);
    }
    parsed = block.input as GeneratedPost;
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    console.error("[publishing/generate] anthropic error:", detail);
    return bad(`יצירת הפוסט נכשלה: ${detail.slice(0, 200)}`, 502);
  }

  if (!parsed.body?.trim()) return bad("המודל החזיר פוסט ריק. נסה/י שוב.", 502);

  return NextResponse.json({
    title: parsed.title?.trim() || role?.role_label || job?.title || "מודעת דרושים",
    body: parsed.body.trim(),
    variants: (parsed.variants ?? [])
      .filter((v) => v?.body?.trim())
      .slice(0, variantCount)
      .map((v) => ({ label: v.label?.trim() || null, body: v.body.trim() })),
  });
}
