import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { fetchUnreadEmails, markAsRead, parseFromHeader } from "@/lib/gmail";
import { parseEmailWithAI } from "@/lib/ai/parse-email";
import { LEAD_STATUSES } from "@/lib/constants";

// Use service-level Supabase client (not cookie-based) for API route
function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function GET() {
  return handleFetchEmails();
}

export async function POST() {
  return handleFetchEmails();
}

async function handleFetchEmails() {
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

        // 2b. Send to Claude AI to detect if this is a lead and extract details
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

        const name = aiResult.name || parseFromHeader(email.from) || "לא ידוע";
        const job_title = aiResult.job_title || null;
        const phone = aiResult.phone;

        // 2d. Check for duplicate by phone number
        if (phone) {
          // Normalize phone for comparison (remove hyphens)
          const normalizedPhone = phone.replace(/-/g, "");
          const { data: existingByPhone } = await supabase
            .from("leads")
            .select("id")
            .or(
              `phone.eq.${phone},phone.eq.${normalizedPhone}`
            )
            .limit(1);

          if (existingByPhone && existingByPhone.length > 0) {
            console.log(
              `[Gmail] Duplicate phone ${phone} found, skipping`
            );
            summary.duplicates++;
            summary.details.push(`Duplicate (phone ${phone}): ${name}`);
            // Still mark as read to avoid reprocessing
            await markAsRead(email.id);
            continue;
          }
        }

        // 2e. Insert new lead
        const { error: insertError } = await supabase.from("leads").insert({
          name,
          phone: aiResult.phone,
          email: aiResult.email,
          location: aiResult.location,
          experience: aiResult.experience,
          age: aiResult.age,
          job_title,
          source: "AllJobs",
          status: LEAD_STATUSES.NEW_LEAD,
          original_email_id: email.id,
          original_email_body: email.body,
          ai_confidence: aiResult.confidence,
          notes: null,
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

        // 2f. Mark email as read
        await markAsRead(email.id);

        // Rate limit: 1s delay between Claude AI calls
        if (summary.processed < emails.length) {
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
