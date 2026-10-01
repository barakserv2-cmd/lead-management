import { NextRequest, NextResponse } from "next/server";
import { normalizePhone } from "@/lib/phone";
import { createClient } from "@supabase/supabase-js";
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
import { enqueueWelcome, runWelcomeBatch } from "@/lib/whatsappWelcome";
import { noteExistingCandidateCall, flushMissedCallAlerts } from "@/lib/missedCallAlert";
import { fillMissingChannels, refineUnknownChannel } from "@/lib/leadChannelFill";
import { getAuthedUser } from "@/lib/api-auth";
import { hasCronSecret } from "@/lib/secrets";
import { pushLeadToMachine } from "@/lib/machineBridge";
import { withHeartbeat } from "@/lib/jobHealth";

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
  if (secret && hasCronSecret(req)) return { ok: true, actor: "cron" };
  try {
    const user = await getAuthedUser();
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

// כל ריצה נרשמת (job_heartbeats) — כשהחיבור ל-Gmail פג, האדמין מקבל התראה
export const GET = withHeartbeat("gmail", handleFetchEmails);
export const POST = withHeartbeat("gmail", handleFetchEmails);

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
      // התראות שיחה שלא נענתה מבשילות גם כשאין מיילים חדשים (בוקר אחרי לילה)
      await flushMissedCallAlerts(getSupabaseAdmin()).catch((e) =>
        console.error("[Gmail] flushMissedCallAlerts failed:", e)
      );
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

          // AllJobs sometimes sends a "bare" application — name only, no
          // phone/city/CV — and routes contact through its own relay. Nothing
          // to parse; tell the recruiter exactly how to reach the candidate so
          // the lead isn't a dead end sitting in "מספר לא תקין".
          if (!phone && /alljobs/i.test(`${email.from} ${email.subject}`)) {
            notes =
              "אולג'ובס לא העביר טלפון במייל (מועמדות ללא פרטי קשר). " +
              "לפנייה: 'השב' למייל המקורי בתיבת barakserv2 (עובר דרך מערכת AllJobs), " +
              "או לפתוח את המועמד ב'ניהול מועמדים' באולג'ובס ולבקש טלפון.";
          }
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
            // פנייה חוזרת (ועדת נפח הלידים 12.09, החלטה 1): המועמד פנה
            // שוב — מתועד על הליד הקיים במקום להיבלע. מיילים של לידים
            // נשארים לא-נקראים ונסרקים שוב ושוב, לכן occurrence_key לפי
            // מזהה המייל מבטיח ספירה של פעם אחת בלבד.
            const { error: repeatErr } = await supabase.rpc("record_repeat_inquiry", {
              p_lead_id: existingByPhone[0].id,
              p_channel: detectSource(email.from, email.subject, email.body),
              p_detail:
                (maskyooCall
                  ? notes ?? ""
                  : [email.subject, job_title].filter(Boolean).join(" · ")
                ).slice(0, 200) || null,
              p_occurrence_key: `repeat:${email.id}`,
            });
            if (repeatErr) {
              console.error(`[Gmail] record_repeat_inquiry failed:`, repeatErr.message);
            }

            // הרכזת ענתה לשיחה והקלידה את הליד בעצמה; המייל של מסקיו
            // מגיע דקה אחריה ונתפס כאן ככפילות. עד עכשיו המספר הווירטואלי
            // נזרק בדיוק כאן — ולכן השיחות שנענו, האיכותיות ביותר, היו
            // היחידות בלי ייחוס לערוץ. רושמים רק אם השדה ריק, כדי לא לדרוס
            // ייחוס קודם — הפנייה הראשונה היא זו שהביאה אותו.
            if (maskyooCall?.virtualNumber) {
              await supabase
                .from("leads")
                .update({ source_number: maskyooCall.virtualNumber })
                .eq("id", existingByPhone[0].id)
                .is("source_number", null);
            }
            // מועמד קיים שהתקשר ולא נענה — הרכזת שלו תקבל התראה (missedCallAlert).
            // גובגט לא כותב לו: הוא לא ליד חדש, ורכזת כבר מחזיקה אותו.
            if (maskyooCall) {
              const callAt =
                email.date && !isNaN(new Date(email.date).getTime()) ? new Date(email.date) : new Date();
              await noteExistingCandidateCall(supabase, {
                leadId: existingByPhone[0].id as string,
                phone,
                call: { status: maskyooCall.status, virtualNumber: maskyooCall.virtualNumber },
                emailId: email.id,
                callAt,
              }).catch((e) => console.error("[Gmail] missed-call note failed:", e));
            }
            // Do NOT mark as read — lead emails must stay unread in the inbox.
            // Dedup is by original_email_id, so re-scanning is safe.
            continue;
          }
        }

        // 2e. Insert new lead
        const { data: insertedLead, error: insertError } = await supabase.from("leads").insert({
          name,
          phone,
          // ייחוס ערוץ בעמודה, לא רק בטקסט ההערות (מיגרציה 00098)
          source_number: maskyooCall?.virtualNumber ?? null,
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
        }).select("id, source").single();

        if (insertError) {
          console.error(`[Gmail] Insert error for ${name}:`, insertError);
          summary.errors++;
          summary.details.push(`Insert error: ${name} - ${insertError.message}`);
          continue;
        }

        summary.new_leads++;
        summary.details.push(`New lead: ${name} (${phone || "no phone"})`);
        console.log(`[Gmail] New lead created: ${name}`);

        // גובגט עונה ראשון לכל ליד חדש. כשל כאן לא מפיל את הקליטה — הליד
        // נשאר בתור ו-cron/sync-new-leads מנסה שוב (lib/machineBridge.ts).
        if (insertedLead?.id) {
          await pushLeadToMachine(supabase, {
            id: insertedLead.id,
            phone,
            name,
            location: location ?? null,
            source: insertedLead.source ?? null,
            job_title: job_title ?? null,
            handled_by: null,
          });
        }

        // בוט הפתיחה (שלב 1): רישום לתור בלבד — השליחה עם מרווחים
        // אנושיים רצה פעם אחת בסוף הסריקה (runWelcomeBatch למטה).
        if (insertedLead?.id && phone) {
          await enqueueWelcome(insertedLead.id, phone, insertedLead.source ?? null, {
            deliver: false,
          }).catch((e) => console.error("[Gmail] enqueueWelcome failed:", e));
        }

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

    // שליחת הודעות הפתיחה שממתינות בתור (כולל מהריצות הקודמות)
    try {
      const batch = await runWelcomeBatch();
      if (batch.sent > 0 || batch.pending > 0) {
        console.log(`[Gmail] Welcome batch: sent ${batch.sent}, still pending ${batch.pending}`);
      }
    } catch (e) {
      console.error("[Gmail] runWelcomeBatch failed:", e);
    }

    // ערוץ לכל ליד חדש, מכל מסלול שבו נוצר (lib/leadChannel.ts)
    try {
      await fillMissingChannels(supabase);
    } catch (e) {
      console.error("[Gmail] fillMissingChannels failed:", e);
    }

    // מועמדים קיימים שהתקשרו ולא נענו — התראה לרכזת (אחרי 10 דק', בשעות התורנות)
    try {
      const missed = await flushMissedCallAlerts(supabase);
      if (missed.sent > 0) console.log(`[Gmail] missed-call alerts sent: ${missed.sent}`);
    } catch (e) {
      console.error("[Gmail] flushMissedCallAlerts failed:", e);
    }

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
