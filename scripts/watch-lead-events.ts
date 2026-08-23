// ממתין להופעת טבלת lead_events (אחרי שסער מריץ את מיגרציה 00035)
import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";
const envFile = readFileSync("C:/Users/Barak/Projects/lead-management/.env.local", "utf-8").replace(/^\uFEFF/, "");
for (const line of envFile.split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, "");
}
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  for (let i = 0; i < 60; i++) {
    const { error } = await s.from("lead_events").select("id").limit(1);
    if (!error) {
      console.log("TABLE_EXISTS after " + i + " checks");
      return;
    }
    await new Promise((r) => setTimeout(r, 30_000));
  }
  console.log("TIMEOUT: table not created within 30 minutes");
}

main();
