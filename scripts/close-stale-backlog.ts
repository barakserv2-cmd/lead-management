// סגירת צבר: לידים ב"ממתין לנציג" שנכנסו לפני יותר מ-30 יום → "אבד קשר",
// כולל רישום בהיסטוריית הסטטוסים (הפיך: ההיסטוריה שומרת מי הועבר ומתי).
// הרצה: npx tsx scripts/close-stale-backlog.ts --apply   (בלי --apply = ספירה בלבד)
import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";

const envFile = readFileSync("C:/Users/Barak/Projects/lead-management/.env.local", "utf-8")
  .replace(/^\uFEFF/, "");
for (const line of envFile.split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, "");
}

const APPLY = process.argv.includes("--apply");
const CUTOFF_DAYS = 30;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  const cutoff = new Date(Date.now() - CUTOFF_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const ids: string[] = [];
  for (let fromIdx = 0; ; fromIdx += 1000) {
    const { data, error } = await supabase
      .from("leads")
      .select("id")
      .eq("status", "NEW_LEAD")
      .lt("created_at", cutoff)
      .order("id")
      .range(fromIdx, fromIdx + 999);
    if (error) throw new Error(error.message);
    ids.push(...(data as { id: string }[]).map((r) => r.id));
    if (!data || data.length < 1000) break;
  }

  console.log(`לידים ב"ממתין לנציג" ישנים מ-${CUTOFF_DAYS} יום (לפני ${cutoff.slice(0, 10)}): ${ids.length}`);

  if (!APPLY) {
    console.log("(ספירה בלבד — הוסף --apply כדי לסגור)");
    return;
  }

  let updated = 0;
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);

    const { error: updErr } = await supabase
      .from("leads")
      .update({ status: "LOST_CONTACT", sub_status: null })
      .in("id", chunk);
    if (updErr) throw new Error(`עדכון סטטוס נכשל: ${updErr.message}`);

    const { error: histErr } = await supabase.from("lead_status_history").insert(
      chunk.map((leadId) => ({
        lead_id: leadId,
        from_status: "NEW_LEAD",
        to_status: "LOST_CONTACT",
        changed_by: "system",
        notes: `סגירת צבר אוטומטית — ליד ישן מ-${CUTOFF_DAYS} יום ללא טיפול`,
      }))
    );
    if (histErr) console.warn(`אזהרה: רישום היסטוריה נכשל לצ'אנק ${i / 500 + 1}: ${histErr.message}`);

    updated += chunk.length;
    console.log(`התקדמות: ${updated}/${ids.length}`);
  }

  console.log(`✓ נסגרו ${updated} לידים — הועברו ל"אבד קשר"`);
}

main().catch((e) => { console.error("שגיאה:", e.message); process.exit(1); });
