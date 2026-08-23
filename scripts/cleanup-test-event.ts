// מחיקת אירוע הבדיקה הזמני (service role — ללקוחות אין מחיקה בכוונה)
import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";
const envFile = readFileSync("C:/Users/Barak/Projects/lead-management/.env.local", "utf-8").replace(/^\uFEFF/, "");
for (const line of envFile.split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, "");
}
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
s.from("lead_events").delete().eq("id", "1619a7d2-60ae-4449-8eac-f36ca48395f7").then(({ error }) => {
  console.log(error ? "שגיאה: " + error.message : "אירוע הבדיקה נמחק");
});
