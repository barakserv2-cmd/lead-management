"use server";

import { createClient as createServerClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { requireRecruiter } from "@/lib/api-auth";

function getAdmin() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function clearLeadAttention(leadId: string): Promise<{ success: boolean; error?: string }> {
  await requireRecruiter();
  const admin = getAdmin();
  const { error } = await admin
    .from("leads")
    .update({ needs_attention: false, needs_attention_at: null, attention_reason: null })
    .eq("id", leadId);
  if (error) return { success: false, error: error.message };
  revalidatePath("/leads");
  return { success: true };
}
