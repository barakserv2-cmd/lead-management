// מחיקת הודעת הבדיקה המדומה עם הקידוד השבור מהצ'אט של סער רביצקי
import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";
const envFile = readFileSync("C:/Users/Barak/Projects/lead-management/.env.local", "utf-8").replace(/^\uFEFF/, "");
for (const line of envFile.split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, "");
}
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  const { data: lead } = await s.from("leads").select("id").eq("phone", "0547000992").limit(1).single();
  if (!lead) { console.log("ליד לא נמצא"); return; }
  // ההודעה המדומה נכנסה ב-07:03 UTC עם קידוד שבור — מזהים לפי תו ההחלפה
  const { data: msgs } = await s
    .from("messages")
    .select("id, content, created_at")
    .eq("lead_id", lead.id)
    .eq("role", "user")
    .gte("created_at", "2026-08-16T07:00:00Z");
  for (const m of msgs ?? []) {
    if (m.content.includes("\uFFFD") || m.content.includes("בדיקת קליטה")) {
      const { error } = await s.from("messages").delete().eq("id", m.id);
      console.log(`נמחקה: ${m.created_at} | ${m.content.slice(0, 30)} | ${error ? "שגיאה: " + error.message : "OK"}`);
    } else {
      console.log(`נשמרה (אמיתית): ${m.created_at} | ${m.content.slice(0, 30)}`);
    }
  }
  if (!msgs?.length) console.log("אין הודעות user מהיום");
}
main().catch((e) => { console.error(e.message); process.exit(1); });
