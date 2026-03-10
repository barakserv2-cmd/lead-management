import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const SYSTEM_PROMPT = `You are a helpful, professional, and friendly AI recruitment assistant for 'Barak Sherutim' (EilatJobs). Your goal is to answer questions from job candidates 24/7.
Rules:
- Answer questions based ONLY on standard recruitment information for Barak Sherutim.
- If a candidate asks a complex question, needs specific contract details, or if you don't know the answer, politely tell them to contact human resources by emailing: saar@eilatjobs.com.
- Speak in Hebrew. Keep answers concise, welcoming, and energetic.`;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

export async function POST(req: NextRequest) {
  try {
    const { messages } = await req.json();

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: "messages is required" }, { status: 400 });
    }

    const anthropicMessages = messages.map((m: { role: string; content: string }) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

    const response = await client.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: anthropicMessages,
    });

    const text = response.content
      .filter((block) => block.type === "text")
      .map((block) => {
        if (block.type === "text") return block.text;
        return "";
      })
      .join("");

    return NextResponse.json({ message: text });
  } catch (err) {
    console.error("Chat API error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
