// בדיקה אילו טבלאות אירועים קיימות בדאטהבייס
import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";

const envFile = readFileSync("C:/Users/Barak/Projects/lead-management/.env.local", "utf-8")
  .replace(/^\uFEFF/, "");
for (const line of envFile.split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, "");
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  for (const t of ["lead_notes", "interaction_logs", "lead_events", "lead_status_history", "communication_logs"]) {
    const { data, error, count } = await supabase.from(t).select("*", { count: "exact" }).limit(1);
    if (error) {
      console.log(`${t}: לא קיימת (${error.message})`);
    } else {
      console.log(`${t}: קיימת, ${count} שורות, עמודות: ${data?.[0] ? Object.keys(data[0]).join(", ") : "(ריקה)"}`);
    }
  }
}

main().catch((e) => { console.error("שגיאה:", e.message); process.exit(1); });
