import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/api-auth";
import { hasMetaLeadKey } from "@/lib/secrets";
import { LEAD_STATUSES } from "@/lib/constants";
import { evaluateScreening, metaLeadSource, parseMetaLead, screeningNote } from "@/lib/metaLead";
import { pushLeadToMachine } from "@/lib/machineBridge";
import { enqueueWelcome } from "@/lib/whatsappWelcome";

/**
 * POST /api/leads/meta — ליד מטופס לידים של Meta, דרך Make.
 *
 * Auth: x-meta-lead-key = META_LEAD_INGEST_KEY.
 * תוצאות:
 *   created   — כרטיס חדש
 *   duplicate — אותו ליד של Meta כבר נקלט (ניסיון חוזר של Make). לא נוגעים.
 *   repeat    — הטלפון כבר קיים: נרשם כפנייה חוזרת על הכרטיס הקיים
 *               (record_repeat_inquiry), בלי כרטיס חדש.
 * כל תשובה חוזרת עם 200 כדי ש-Make לא ינסה שוב ליד שכבר טופל; 4xx רק
 * לבקשה שגויה, 5xx רק לכשל אמיתי שכדאי לנסות שוב.
 */
export async function POST(req: NextRequest) {
  if (!hasMetaLeadKey(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const parsed = parseMetaLead(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const lead = parsed.lead;

  const db = getSupabaseAdmin();

  const findByMetaId = () =>
    db.from("leads").select("id").eq("meta_lead_id", lead.leadgenId).limit(1).maybeSingle();
  const findByPhone = () =>
    db.from("leads").select("id").eq("phone", lead.phone).limit(1).maybeSingle();

  const recordRepeat = async (leadId: string) => {
    const { error } = await db.rpc("record_repeat_inquiry", {
      p_lead_id: leadId,
      p_channel: "פייסבוק ממומן",
      p_detail: [lead.campaignName, lead.adName].filter(Boolean).join(" · ").slice(0, 200) || null,
      p_occurrence_key: `meta:${lead.leadgenId}`,
    });
    if (error) throw new Error(`record_repeat_inquiry: ${error.message}`);
  };

  try {
    const byMeta = await findByMetaId();
    if (byMeta.error) throw new Error(byMeta.error.message);
    if (byMeta.data) return NextResponse.json({ result: "duplicate", lead_id: byMeta.data.id });

    const byPhone = await findByPhone();
    if (byPhone.error) throw new Error(byPhone.error.message);
    if (byPhone.data) {
      await recordRepeat(byPhone.data.id);
      return NextResponse.json({ result: "repeat", lead_id: byPhone.data.id });
    }

    const screening = evaluateScreening(lead.answers);
    const source = metaLeadSource(lead);
    const { data: inserted, error: insertError } = await db
      .from("leads")
      .insert({
        name: lead.name,
        phone: lead.phone,
        email: lead.email,
        job_title: lead.answers.role ?? null,
        source,
        channel: "פייסבוק ממומן",
        contact_method: "טופס",
        campaign: lead.campaignName,
        channel_set_by: "auto",
        status: LEAD_STATUSES.NEW_LEAD,
        email_date: lead.createdAt && !isNaN(Date.parse(lead.createdAt)) ? new Date(lead.createdAt).toISOString() : null,
        notes: screeningNote(lead, screening),
        meta_lead_id: lead.leadgenId,
        meta_form_id: lead.formId,
        meta_campaign_id: lead.campaignId,
        meta_adset_id: lead.adsetId,
        meta_ad_id: lead.adId,
        meta_ad_name: lead.adName,
        screening_answers: lead.answers,
        screening_passed: screening.passed,
        assigned_to: null,
      })
      .select("id, source")
      .single();

    if (insertError) {
      // מרוץ: אותו ליד או אותו טלפון נקלטו במקביל. מכריעים לפי מה שקיים עכשיו.
      if (insertError.code === "23505") {
        const again = await findByMetaId();
        if (again.data) return NextResponse.json({ result: "duplicate", lead_id: again.data.id });
        const owner = await findByPhone();
        if (owner.data) {
          await recordRepeat(owner.data.id);
          return NextResponse.json({ result: "repeat", lead_id: owner.data.id });
        }
      }
      throw new Error(`insert: ${insertError.message}`);
    }

    // כמו ליד ממייל: גובגט עונה ראשון, והודעת הפתיחה נכנסת לתור.
    // כשל כאן לא מפיל את הקליטה — cron/sync-new-leads מנסה שוב.
    await pushLeadToMachine(db, {
      id: inserted.id,
      phone: lead.phone,
      name: lead.name,
      location: null,
      source: inserted.source ?? source,
      job_title: lead.answers.role ?? null,
      handled_by: null,
    }).catch((e) => console.error("[MetaLead] pushLeadToMachine failed:", e));
    await enqueueWelcome(inserted.id, lead.phone, inserted.source ?? source).catch((e) =>
      console.error("[MetaLead] enqueueWelcome failed:", e)
    );

    return NextResponse.json({ result: "created", lead_id: inserted.id, screening_passed: screening.passed });
  } catch (e) {
    console.error("[MetaLead] failed:", e);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
