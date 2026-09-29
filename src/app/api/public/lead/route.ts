import { NextRequest, NextResponse, after } from "next/server";
import { getSupabaseAdmin } from "@/lib/api-auth";
import { logAudit } from "@/lib/audit";
import { sendWelcomeMessage } from "@/lib/whatsappWelcome";
import { findLeadByPhone, isPhoneUniqueViolation } from "@/lib/leadPhoneGuard";
import {
  isAllowedOrigin,
  parsePublicLead,
  rateLimited,
  sourceForPublicLead,
  type PublicLeadInput,
} from "@/lib/publicLead";

// הטופס של האתר הציבורי (site/). בלי מפתח API — ההגנות ב-publicLead.ts.
// ליד קיים לא נחשף: מחזירים ok בכל מקרה ורושמים ביומן שלו פנייה חוזרת.

function cors(origin: string | null): Record<string, string> {
  if (!isAllowedOrigin(origin, process.env.PUBLIC_SITE_ORIGINS)) return {};
  return {
    "Access-Control-Allow-Origin": origin!,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: cors(request.headers.get("origin")) });
}

function journalText(lead: PublicLeadInput, repeat: boolean): string {
  const parts = [repeat ? "פנייה חוזרת מהאתר" : "פנייה מהאתר"];
  if (lead.interest) parts.push(`תחום: ${lead.interest}`);
  if (lead.start) parts.push(`זמינות: ${lead.start}`);
  if (lead.page) parts.push(`עמוד: ${lead.page}`);
  const utm = [lead.utm.source, lead.utm.medium, lead.utm.campaign].filter(Boolean).join(" / ");
  if (utm) parts.push(`UTM: ${utm}`);
  parts.push(`הסכמה למדיניות הפרטיות סומנה בטופס${lead.consentVersion ? ` (נוסח ${lead.consentVersion})` : ""}`);
  return parts.join(" · ");
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  const headers = cors(origin);
  if (!headers["Access-Control-Allow-Origin"]) {
    return NextResponse.json({ ok: false, error: "origin" }, { status: 403 });
  }

  const ip = (request.headers.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || "unknown";
  if (rateLimited(ip)) {
    return NextResponse.json({ ok: false, error: "rate" }, { status: 429, headers });
  }

  const body = await request.json().catch(() => null);
  const parsed = parsePublicLead(body);
  if (!parsed.ok) {
    // לבוט מחזירים הצלחה כדי שלא ילמד לעקוף
    if (parsed.error === "bot") return NextResponse.json({ ok: true }, { headers });
    return NextResponse.json({ ok: false, error: parsed.error }, { status: 400, headers });
  }
  const lead = parsed.lead;

  try {
    const db = getSupabaseAdmin();
    const source = sourceForPublicLead(lead.utm);

    const existing = await findLeadByPhone(db, lead.phone);
    if (existing) {
      await db.from("lead_events").insert({
        lead_id: existing.id,
        event_type: "אחר",
        event_text: journalText(lead, true),
        created_by: "אתר",
      });
      return NextResponse.json({ ok: true }, { headers });
    }

    const { data: created, error } = await db
      .from("leads")
      .insert({
        name: lead.name,
        phone: lead.phone,
        job_title: lead.interest || "כללי",
        source,
        status: "NEW_LEAD",
      })
      .select("id, phone")
      .single();

    if (error) {
      if (isPhoneUniqueViolation(error)) return NextResponse.json({ ok: true }, { headers });
      console.error("[public/lead] insert failed:", error.message);
      return NextResponse.json({ ok: false, error: "server" }, { status: 500, headers });
    }

    await db.from("lead_events").insert({
      lead_id: created.id,
      event_type: "אחר",
      event_text: journalText(lead, false),
      created_by: "אתר",
    });
    await logAudit({
      action: "create",
      leadId: created.id,
      actor: "public-site",
      actorType: "api",
      meta: {
        source,
        page: lead.page,
        utm: lead.utm,
        consent: { given: true, version: lead.consentVersion, at: new Date().toISOString() },
      },
      request,
    });

    if (created.phone) {
      after(sendWelcomeMessage(created.id, created.phone).catch(console.error));
    }
    return NextResponse.json({ ok: true }, { headers });
  } catch (err) {
    console.error("[public/lead] unexpected:", err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, error: "server" }, { status: 500, headers });
  }
}
