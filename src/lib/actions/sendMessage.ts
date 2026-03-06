"use server";

import { processIncomingMessage, type ProcessMessageResult } from "@/lib/aiService";
import { revalidatePath } from "next/cache";

export async function sendMessage(
  leadId: string,
  messageText: string
): Promise<ProcessMessageResult> {
  const result = await processIncomingMessage(leadId, messageText);

  if (result.success) {
    revalidatePath(`/leads/${leadId}`);
    revalidatePath("/leads");
  }

  return result;
}
