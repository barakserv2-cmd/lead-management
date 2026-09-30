import type { SupabaseClient } from "@supabase/supabase-js";
import { classifyLead } from "@/lib/leadChannel";

// ============================================================
// ממלא ערוץ לכל ליד שעוד אין לו — מכל מסלול שבו נוצר (מייל, וואטסאפ,
// ידני, הגשר מגובגט, ייבוא). רץ בסוף כל סריקת מיילים (כל 2 דקות),
// כך שאין צורך לגעת בכל אחד מ-20 המקומות שיוצרים ליד.
//
// ליד שהערוץ שלו נבחר ביד — לא נוגעים, חוץ מ"לא ידוע": אם בינתיים
// הגיעה שיחה ממספר מסקיו, המספר יודע יותר מהרכזת.
// ============================================================

const BATCH = 200;

interface Row {
  id: string;
  source: string | null;
  source_number: string | null;
  original_email_id: string | null;
  original_email_subject: string | null;
  original_email_body: string | null;
  channel: string | null;
  channel_set_by: string | null;
}

export async function fillMissingChannels(db: SupabaseClient): Promise<number> {
  const { data } = await db.from("leads")
    .select("id, source, source_number, original_email_id, original_email_subject, original_email_body, channel, channel_set_by")
    .is("channel", null)
    .order("created_at", { ascending: false })
    .limit(BATCH);
  const rows = (data ?? []) as Row[];
  let n = 0;
  for (const l of rows) {
    const c = classifyLead({ ...l, manual: !l.original_email_id });
    const { error } = await db.from("leads")
      .update({ channel: c.channel, contact_method: c.method, campaign: c.campaign, channel_set_by: "auto" })
      .eq("id", l.id)
      .is("channel", null); // לא לדרוס בחירה שנעשתה בינתיים
    if (!error) n++;
  }
  return n;
}

/**
 * ליד שהרכזת סימנה "לא ידוע" וקיבל בינתיים מספר מסקיו — המספר קובע.
 * נקרא מהמקום שרושם source_number על ליד קיים.
 */
export async function refineUnknownChannel(db: SupabaseClient, leadId: string): Promise<void> {
  const { data } = await db.from("leads")
    .select("id, source, source_number, original_email_id, original_email_subject, original_email_body, channel, channel_set_by")
    .eq("id", leadId)
    .maybeSingle();
  const l = data as Row | null;
  if (!l || (l.channel && l.channel !== "לא ידוע")) return;
  const c = classifyLead({ ...l, manual: !l.original_email_id });
  if (c.channel === "לא ידוע") return;
  await db.from("leads")
    .update({ channel: c.channel, contact_method: c.method, campaign: c.campaign, channel_set_by: "auto" })
    .eq("id", leadId);
}
