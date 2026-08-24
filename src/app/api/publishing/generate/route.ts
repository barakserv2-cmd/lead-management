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
export const maxDuration = 60;

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

החזר/י JSON בלבד, ללא טקסט נלווה, במבנה:
{"title": "כותרת פנימית קצרה למערכת", "body": "המודעה הראשית", "variants": [{"label": "זווית", "body": "..."}]}`;

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

  let raw: string;
  try {
    const message = await anthropic.messages.create({
      model: "claude-opus-5",
      max_tokens: 3000,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `כתוב/כתבי מודעת דרושים + ${variantCount} וריאציות.\n\nנתונים:\n${facts.join("\n")}`,
        },
        // Prefilled assistant turn — forces the reply to start as JSON.
        { role: "assistant", content: "{" },
      ],
    });
    const block = message.content.find((c) => c.type === "text");
    raw = "{" + (block && block.type === "text" ? block.text : "");
  } catch (e) {
    console.error("[publishing/generate] anthropic error", e);
    return bad("יצירת הפוסט נכשלה. נסה/י שוב.", 502);
  }

  let parsed: GeneratedPost;
  try {
    const jsonText = raw.slice(0, raw.lastIndexOf("}") + 1);
    parsed = JSON.parse(jsonText) as GeneratedPost;
  } catch {
    console.error("[publishing/generate] unparsable reply", raw.slice(0, 400));
    return bad("התשובה מהמודל לא הייתה בפורמט תקין. נסה/י שוב.", 502);
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
