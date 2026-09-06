import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import { businessAccount, sendWhatsAppMessage } from "@/lib/whatsappService";

// Daily digest of open recruiter feedback → WhatsApp to the admin.
// Guarded by CRON_SECRET. Scheduled once a day (see vercel.json).

const CAT_LABEL: Record<string, string> = { machine: "המכונה", system: "המערכת", other: "אחר" };

function getAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}
function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return (req.headers.get("authorization") ?? "") === `Bearer ${secret}`;
}

async function summarize(items: { category: string; author: string; body: string }[]): Promise<string> {
  const raw = items
    .map((it) => `- [${CAT_LABEL[it.category] ?? it.category}] ${it.author}: ${it.body}`)
    .join("\n");
  try {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error("no key");
    const client = new Anthropic();
    const resp = await client.messages.create({
      model: process.env.AI_MODEL_CONVERSATION ?? "claude-sonnet-5",
      max_tokens: 700,
      system:
        "אתה מסכם למנהל דיווחי בעיות מרכזות גיוס על המכונה (גובגט) והמערכת (CRM). " +
        "כתוב סיכום קצר ומעשי בעברית: קבץ לפי נושא, ציין כמה פעמים כל בעיה חזרה, וסדר לפי דחיפות. " +
        "בלי הקדמות. טקסט בלבד לוואטסאפ.",
      messages: [{ role: "user", content: `דיווחים פתוחים:\n${raw}` }],
    });
    const block = resp.content.find((b) => b.type === "text");
    const txt = block && block.type === "text" ? block.text.trim() : "";
    return txt || raw;
  } catch {
    return raw; // AI down → send the raw list, never skip the digest
  }
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const db = getAdmin();
  const { data: items } = await db
    .from("recruiter_feedback")
    .select("id, category, author, body")
    .eq("status", "open")
    .order("created_at", { ascending: true });

  if (!items || items.length === 0) {
    return NextResponse.json({ ok: true, sent: false, reason: "no open feedback" });
  }

  const summary = await summarize(items);
  const phone = process.env.FEEDBACK_DIGEST_PHONE ?? "0547000992";
  const message = `📋 סיכום דיווחי רכזות (${items.length} פתוחים)\n\n${summary}\n\nלטיפול: /feedback`;

  const res = await sendWhatsAppMessage(phone, message, businessAccount(), { skipGate: true });
  if (res.success) {
    await db
      .from("recruiter_feedback")
      .update({ digested_at: new Date().toISOString() })
      .in("id", items.map((i) => i.id));
  }
  return NextResponse.json({ ok: res.success, sent: res.success, count: items.length, error: res.error });
}
