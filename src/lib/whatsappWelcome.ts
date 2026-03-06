// ============================================================
// WhatsApp Welcome — Auto-send first AI message to new leads
// ============================================================

import { changeLeadStatus } from "@/lib/actions/changeLeadStatus";
import { processIncomingMessage } from "@/lib/aiService";
import { sendWhatsAppMessage } from "@/lib/whatsappService";
import { LeadStatus } from "@/lib/stateMachine";

/**
 * Transition a new lead to SCREENING_IN_PROGRESS, generate
 * an AI welcome message, and send it via WhatsApp.
 *
 * Designed to be called fire-and-forget (.catch(console.error)).
 */
export async function sendWelcomeMessage(
  leadId: string,
  phone: string
): Promise<void> {
  try {
    // 1. NEW_LEAD → CONTACTED
    const step1 = await changeLeadStatus({
      leadId,
      newStatus: LeadStatus.CONTACTED,
      userId: "ai-recruiter",
      notes: "נוצר קשר אוטומטי — הודעת וואטסאפ ראשונה",
    });
    if (!step1.success) {
      console.error(`[WhatsApp Welcome] Failed NEW_LEAD→CONTACTED for ${leadId}:`, step1.error);
      return;
    }

    // 2. CONTACTED → SCREENING_IN_PROGRESS
    const step2 = await changeLeadStatus({
      leadId,
      newStatus: LeadStatus.SCREENING_IN_PROGRESS,
      userId: "ai-recruiter",
      notes: "סינון AI התחיל אוטומטית",
    });
    if (!step2.success) {
      console.error(`[WhatsApp Welcome] Failed CONTACTED→SCREENING for ${leadId}:`, step2.error);
      return;
    }

    // 3. Generate AI welcome via a synthetic first message
    const result = await processIncomingMessage(
      leadId,
      "היי, אני מעוניין/ת בעבודה"
    );

    if (!result.success) {
      console.error(`[WhatsApp Welcome] AI processing failed for ${leadId}:`, result.error);
      return;
    }

    // 4. Send the AI reply to WhatsApp
    if (result.aiReply) {
      const sendResult = await sendWhatsAppMessage(phone, result.aiReply);
      if (!sendResult.success) {
        console.error(`[WhatsApp Welcome] Send failed for ${leadId}:`, sendResult.error);
      }
    }
  } catch (err) {
    console.error(`[WhatsApp Welcome] Unexpected error for ${leadId}:`, err);
  }
}
