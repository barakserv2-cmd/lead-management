import { NextRequest, NextResponse } from "next/server";
import { normalizePhone } from "@/lib/phone";
import { createClient } from "@supabase/supabase-js";
import { createClient as createCookieClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import {
  fetchUnreadEmails,
  parseFromHeader,
  detectSource,
  isMaskyooEmail,
  parseMaskyooCall,
  INTERNAL_PHONE_NUMBERS,
} from "@/lib/gmail";
import { parseEmailWithAI } from "@/lib/ai/parse-email";
import { LEAD_STATUSES } from "@/lib/constants";

// Let the run finish instead of being cut off mid-batch — a truncated run left
// newer lead emails un-ingested. Pro allows up to 300s.
export const maxDuration = 300;

// Service-role client — this route writes leads and must not depend on the
// anon RLS policies (which are being closed, see migration 00046).
function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// Who may trigger a scrape:
//   * Vercel cron  → Authorization: Bearer <CRON_SECRET> (Vercel adds it)
//   * the settings page "סנכרון" button → signed-in recruiter session
// Anything else is rejected. Previously this was fully public.
async function authorize(req: NextRequest): Promise<{ ok: true; actor: string } | { ok: false }> {
  const secret = process.env.CRON_SECRET;
  const header = req.headers.get("authorization") ?? "";
  if (secret && header === `Bearer ${secret}`) return { ok: true, actor: "cron" };
  try {
    const supabase = await createCookieClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) return { ok: true, actor: user.email ?? "user" };
  } catch {
    /* no session */
  }
  if (!secret && process.env.NODE_ENV !== "production") return { ok: true, actor: "dev" };
  return { ok: false };
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function GET(req: NextRequest) {
  return handleFetchEmails(req);
}

export async function POST(req: NextRequest) {
  return handleFetchEmails(req);
}

async function handleFetchEmails(req: NextRequest) {
  const auth = await authorize(req);
  if (!auth.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (auth.actor !== "cron") {
    // manual trigger from the dashboard — worth a line in the audit trail
    await logAudit({ action: "import", entity: "gmail_scrape", actor: auth.actor, request: req, meta: { manual: true } });
  }

  const summary = {
    processed: 0,
    new_leads: 0,
    duplicates: 0,
    skipped: 0,
    errors: 0,
    details: [] as string[],
  };

  try {
    // 1. Fetch all unread emails
    console.log("[Gmail] Fetching all unread emails...");
    const emails = await fetchUnreadEmails(100);
    console.log(`[Gmail] Found ${emails.length} unread emails`);

    if (emails.length === 0) {
      return NextResponse.json({
        ...summary,
        message: "No unread emails found",
      });
    }

    const supabase = getSupabaseAdmin();

    // 2. Process each email
    for (const email of emails) {
      try {
        summary.processed++;
        console.log(
          `[Gmail] Processing email ${summary.processed}/${emails.length}: ${email.subject}`
        );

        // 2a. Check if this email was already processed (by Gmail message ID)
        const { data: existingByEmailId } = await supabase
          .from("leads")
          .select("id")
          .eq("original_email_id", email.id)
          .limit(1);

        if (existingByEmailId && existingByEmailId.length > 0) {
          console.log(`[Gmail] Email ${email.id} already processed, skipping`);
          summary.duplicates++;
          summary.details.push(`Skipped (already processed): ${email.subject}`);
          continue;
        }

        // 2b. Maskyoo call notifications have a fixed structure — parse
        // directly, no Claude. Every incoming call (answered or missed) is a
        // phone lead; missed calls especially, since no one else records them.
        let name: string;
        let job_title: string | null;
        let phone: string | null;
        let leadEmail: string | null = null;
        let location: string | null = null;
        let experience: string | null = null;
        let age: number | null = null;
        let confidence: number;
        let notes: string | null = null;
        let usedAI = false;

        const maskyooCall = isMaskyooEmail(email.from, email.subject)
          ? parseMaskyooCall(email.body)
          : null;

        if (maskyooCall) {
          const caller = normalizePhone(maskyooCall.caller);
          if (!caller || INTERNAL_PHONE_NUMBERS.has(caller)) {
            console.log(
              `[Gmail] Maskyoo call from internal/invalid number ${maskyooCall.caller}, skipping`
            );
            summary.skipped++;
            summary.details.push(`Skipped (internal call): ${maskyooCall.caller}`);
            continue;
          }
          name = "לא ידוע";
          job_title = null;
          phone = caller;
          confidence = 1;
          const answered = maskyooCall.status === "ANSWER";
          notes = [
            answered
              ? `שיחה נכנסת שנענתה (${maskyooCall.durationSeconds ?? "?"} שנ')`
              : `שיחה נכנסת שלא נענתה (${maskyooCall.status ?? "סטטוס לא ידוע"}) — לחזור למועמד`,
            maskyooCall.virtualNumber ? `מספר וירטואלי: ${maskyooCall.virtualNumber}` : null,
          ]
            .filter(Boolean)
            .join(" | ");
        } else {
          // Send to Claude AI to detect if this is a lead and extract details
          usedAI = true;
          const aiResult = await parseEmailWithAI(email.body, email.subject, email.from);
          console.log(
            `[Gmail] AI result: is_lead=${aiResult.is_lead}, ${aiResult.name}, phone: ${aiResult.phone}, confidence: ${aiResult.confidence}`
          );

          // 2c. Skip emails that are not leads
          if (!aiResult.is_lead) {
            console.log(`[Gmail] Not a lead, skipping: ${email.subject}`);
            summary.skipped++;
            summary.details.push(`Skipped (not a lead): ${email.subject}`);
            continue;
          }

          name = aiResult.name || parseFromHeader(email.from) || "לא ידוע";
          job_title = aiResult.job_title || null;
          // canonical 10-digit form (migration 00047) — same candidate, one card
          phone = normalizePhone(aiResult.phone);
          leadEmail = aiResult.email;
          location = aiResult.location;
          experience = aiResult.experience;
          age = aiResult.age;
          confidence = aiResult.confidence;
        }

        // 2d. Check for duplicate by phone number
        if (phone) {
          const { data: existingByPhone } = await supabase
            .from("leads")
            .select("id")
            .eq("phone", phone)
            .limit(1);

          if (existingByPhone && existingByPhone.length > 0) {
            console.log(
              `[Gmail] Duplicate phone ${phone} found, skipping`
            );
            summary.duplicates++;
            summary.details.push(`Duplicate (phone ${phone}): ${name}`);
            // Do NOT mark as read — lead emails must stay unread in the inbox.
            // Dedup is by original_email_id, so re-scanning is safe.
            continue;
          }
        }

        // 2e. Insert new lead
        const { error: insertError } = await supabase.from("leads").insert({
          name,
          phone,
          email: leadEmail,
          location,
          experience,
          age,
          job_title,
          source: detectSource(email.from, email.subject, email.body),
          status: LEAD_STATUSES.NEW_LEAD,
          original_email_id: email.id,
          original_email_body: email.body,
          original_email_from: email.from,
          original_email_subject: email.subject,
          // Real send date from the email's Date header — leads are sorted by
          // this (via effective_at), so an old backlog email doesn't float to
          // the top just because it was ingested today.
          email_date:
            email.date && !isNaN(new Date(email.date).getTime())
              ? new Date(email.date).toISOString()
              : null,
          ai_confidence: confidence,
          notes,
          assigned_to: null,
        });

        if (insertError) {
          console.error(`[Gmail] Insert error for ${name}:`, insertError);
          summary.errors++;
          summary.details.push(`Insert error: ${name} - ${insertError.message}`);
          continue;
        }

        summary.new_leads++;
        summary.details.push(`New lead: ${name} (${phone || "no phone"})`);
        console.log(`[Gmail] New lead created: ${name}`);

        // NOTE: we intentionally do NOT mark the email as read — new leads
        // stay unread in the inbox so they're visible there too. The scraper
        // no longer relies on unread status (it scans a recent time window and
        // dedups by original_email_id), so this is safe and won't re-ingest.

        // Rate limit: 1s delay between Claude AI calls (Maskyoo emails are
        // parsed locally — no AI call, no need to wait)
        if (usedAI && summary.processed < emails.length) {
          await delay(1000);
        }
      } catch (emailError) {
        console.error(
          `[Gmail] Error processing email ${email.id}:`,
          emailError
        );
        summary.errors++;
        summary.details.push(
          `Error: ${email.subject} - ${emailError instanceof Error ? emailError.message : "Unknown error"}`
        );
      }
    }

    console.log(
      `[Gmail] Done. Processed: ${summary.processed}, New: ${summary.new_leads}, Skipped: ${summary.skipped}, Duplicates: ${summary.duplicates}, Errors: ${summary.errors}`
    );

    return NextResponse.json(summary);
  } catch (error) {
    console.error("[Gmail] Fatal error:", error);
    return NextResponse.json(
      {
        ...summary,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
