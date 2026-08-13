// פילוח מהיר של סטטוסים בטבלת הלידים
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
  const dist = new Map<string, number>();
  for (let fromIdx = 0; ; fromIdx += 1000) {
    const { data, error } = await supabase
      .from("leads")
      .select("status, hired_client")
      .order("id")
      .range(fromIdx, fromIdx + 999);
    if (error) throw new Error(error.message);
    for (const r of data as { status: string | null; hired_client: string | null }[]) {
      const key = `${r.status ?? "(ריק)"}${r.hired_client ? " [יש מעסיק]" : ""}`;
      dist.set(key, (dist.get(key) ?? 0) + 1);
    }
    if (!data || data.length < 1000) break;
  }
  for (const [k, n] of [...dist.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`${String(n).padStart(6)}  ${k}`);
  }
}

main().catch((e) => { console.error("שגיאה:", e.message); process.exit(1); });
