// ניסיון אחרון ל-DDL בלי דשבורד: rpc בשם exec_sql/execute_sql אם קיים
import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";
const envFile = readFileSync("C:/Users/Barak/Projects/lead-management/.env.local", "utf-8").replace(/^\uFEFF/, "");
for (const line of envFile.split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, "");
}
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
async function main() {
  for (const fn of ["exec_sql", "execute_sql", "run_sql", "sql"]) {
    const { error } = await s.rpc(fn, { query: "select 1" });
    console.log(fn + ":", error ? error.message : "עובד!");
  }
}
main();
