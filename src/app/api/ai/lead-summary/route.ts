import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import type { Lead } from "@/types/leads";
import { STATUS_LABELS } from "@/lib/stateMachine";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY is not configured" },
        { status: 500 }
      );
    }
    const openai = new OpenAI({ apiKey });
    const { lead } = (await request.json()) as { lead: Lead };

    if (!lead || !lead.id) {
      return NextResponse.json({ error: "Missing lead data" }, { status: 400 });
    }

    const statusLabel = STATUS_LABELS[lead.status] ?? lead.status;

    const prompt = `You are a recruitment CRM assistant for an Israeli staffing agency. Summarize this lead in 1-2 concise sentences in Hebrew. Focus on actionable insights: who they are, their current stage, and what the recruiter should do next.

Lead data:
- Name: ${lead.name}
- Phone: ${lead.phone ?? "N/A"}
- Email: ${lead.email ?? "N/A"}
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
