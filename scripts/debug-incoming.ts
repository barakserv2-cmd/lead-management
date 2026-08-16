// דיבוג הודעות נכנסות: מה נשמר ב-messages לאחרונה, ומה הטלפונים על לידי הבדיקה
import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";
const envFile = readFileSync("C:/Users/Barak/Projects/lead-management/.env.local", "utf-8").replace(/^\uFEFF/, "");
for (const line of envFile.split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, "");
}
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  const { data: msgs } = await s
    .from("messages")
    .select("lead_id, role, content, created_at")
    .order("created_at", { ascending: false })
    .limit(10);
  console.log("── 10 הודעות אחרונות ──");
  for (const m of msgs ?? []) {
    console.log(`${m.created_at} | ${m.role} | lead ${String(m.lead_id).slice(0, 8)} | ${String(m.content).slice(0, 40)}`);
  }

  const { data: leads } = await s
    .from("leads")
    .select("id, name, phone, status")
    .or("name.ilike.%סער%,name.ilike.%רביצקי%")
    .limit(10);
  console.log("\n── לידים של סער ──");
  for (const l of leads ?? []) {
    console.log(`${l.name} | phone: ${l.phone} | ${l.status} | ${l.id.slice(0, 8)}`);
  }
}
main().catch((e) => { console.error(e.message); process.exit(1); });
