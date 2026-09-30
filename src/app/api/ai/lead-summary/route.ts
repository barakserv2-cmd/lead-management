import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import type { Lead } from "@/types/leads";
import { STATUS_LABELS } from "@/lib/stateMachine";
import { getAuthedUser, getSupabaseAdmin } from "@/lib/api-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// הנתיב היה פתוח בלי התחברות וקיבל אובייקט ליד מהדפדפן: כל אחד יכול היה
// להריץ שיחות על חשבון ה-OpenAI של החברה. עכשיו: רק רכזת, רק לפי מזהה,
// והליד נטען בשרת. טלפון ואימייל לא נשלחים — הסיכום לא צריך אותם.
const SUMMARY_COLUMNS =
  "id, name, job_title, location, experience, age, source, status, sub_status, rejection_reason, " +
  "hired_client, hired_position, interview_date, interview_notes, screening_score, notes, tags, created_at";

export async function POST(request: NextRequest) {
  // סריקת אבטחה 24.09: הנתיב הזה רץ בלי שום אימות על OPENAI_API_KEY
  // שלנו. בקשה אנונימית בפרודקשן החזירה 200 — כלומר מי שמצא את ה-URL
  // שילם על חשבוננו. רק מגייס/ת מחובר/ת מפעיל/ה אותו.
  const user = await getAuthedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY is not configured" },
        { status: 500 }
      );
    }
    const openai = new OpenAI({ apiKey });
    const body = (await request.json().catch(() => ({}))) as { leadId?: string; lead?: { id?: string } };
    const leadId = body.leadId ?? body.lead?.id;
    if (!leadId) {
      return NextResponse.json({ error: "Missing lead id" }, { status: 400 });
    }
    const { data: lead } = await getSupabaseAdmin()
      .from("leads")
      .select(SUMMARY_COLUMNS)
      .eq("id", leadId)
      .maybeSingle<Lead>();
    if (!lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    const statusLabel = STATUS_LABELS[lead.status] ?? lead.status;

    const prompt = `You are a recruitment CRM assistant for an Israeli staffing agency. Summarize this lead in 1-2 concise sentences in Hebrew. Focus on actionable insights: who they are, their current stage, and what the recruiter should do next.

Lead data:
- Name: ${lead.name}
- Job title: ${lead.job_title ?? "N/A"}
- Location: ${lead.location ?? "N/A"}
- Experience: ${lead.experience ?? "N/A"}
- Age: ${lead.age ?? "N/A"}
- Source: ${lead.source}
- Status: ${statusLabel}
- Sub-status: ${lead.sub_status ?? "N/A"}
- Rejection reason: ${lead.rejection_reason ?? "N/A"}
- Hired client: ${lead.hired_client ?? "N/A"}
- Hired position: ${lead.hired_position ?? "N/A"}
- Interview date: ${lead.interview_date ?? "N/A"}
- Interview notes: ${lead.interview_notes ?? "N/A"}
- Screening score: ${lead.screening_score ?? "N/A"}
- Notes: ${lead.notes ?? "N/A"}
- Tags: ${lead.tags?.join(", ") ?? "N/A"}
- Created: ${lead.created_at}`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 200,
      temperature: 0.7,
    });

    const summary = completion.choices[0]?.message?.content?.trim() ?? "";

    return NextResponse.json({ summary });
  } catch (error) {
    console.error("AI summary error:", error);
    return NextResponse.json(
      { error: "Failed to generate summary" },
      { status: 500 }
    );
  }
}
