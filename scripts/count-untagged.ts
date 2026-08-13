// ספירה מהירה: כמה לידים במערכת בלי מייל מקורי, ומה פילוח המקורות שלהם
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
  const { count: total } = await supabase
    .from("leads")
    .select("*", { count: "exact", head: true });

  const { count: noEmail } = await supabase
    .from("leads")
    .select("*", { count: "exact", head: true })
    .is("original_email_subject", null);

  const { count: noEmailWithPhone } = await supabase
    .from("leads")
    .select("*", { count: "exact", head: true })
    .is("original_email_subject", null)
    .not("phone", "is", null)
    .not("phone", "like", "no-phone-%");

  console.log(`סה"כ לידים: ${total}`);
  console.log(`בלי מייל מקורי: ${noEmail}`);
  console.log(`בלי מייל מקורי אבל עם טלפון אמיתי (ניתנים להצלבה): ${noEmailWithPhone}`);

  // פילוח מקורות של הלידים בלי מייל מקורי
  const dist = new Map<string, number>();
  for (let fromIdx = 0; ; fromIdx += 1000) {
    const { data, error } = await supabase
      .from("leads")
      .select("source")
      .is("original_email_subject", null)
      .order("id")
      .range(fromIdx, fromIdx + 999);
    if (error) throw new Error(error.message);
    for (const r of data as { source: string | null }[]) {
      const key = r.source ?? "(ריק)";
      dist.set(key, (dist.get(key) ?? 0) + 1);
    }
    if (!data || data.length < 1000) break;
  }
  console.log("\nפילוח מקורות נוכחי (ללא מייל מקורי):");
  for (const [src, n] of [...dist.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(5)}  ${src}`);
  }
}

main().catch((e) => { console.error("שגיאה:", e.message); process.exit(1); });
