// תיוג-מחדש חד-פעמי של גורם גיוס לפי המייל המקורי השמור על כל ליד.
// הרצה: npx tsx retag-leads.ts [--apply]  (בלי --apply = dry run)
import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";
import { detectSource } from "C:/Users/Barak/Projects/lead-management/src/lib/gmail";

// טעינת env מהפרויקט
const envFile = readFileSync("C:/Users/Barak/Projects/lead-management/.env.local", "utf-8")
  .replace(/^\uFEFF/, ""); // BOM בתחילת הקובץ מפיל את השורה הראשונה
for (const line of envFile.split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, "");
}

const APPLY = process.argv.includes("--apply");

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  // שליפת כל הלידים שיש להם מייל מקורי, בדפים של 1000
  type Row = {
    id: string;
    source: string | null;
    original_email_from: string | null;
    original_email_subject: string | null;
    original_email_body: string | null;
  };
  const rows: Row[] = [];
  for (let fromIdx = 0; ; fromIdx += 1000) {
    const { data, error } = await supabase
      .from("leads")
      .select("id, source, original_email_from, original_email_subject, original_email_body")
      .not("original_email_subject", "is", null)
      .order("id")
      .range(fromIdx, fromIdx + 999);
    if (error) throw new Error(error.message);
    rows.push(...(data as Row[]));
    if (!data || data.length < 1000) break;
  }

  console.log(`נשלפו ${rows.length} לידים עם מייל מקורי\n`);

  const changes: { id: string; oldSource: string | null; newSource: string }[] = [];
  const dist = new Map<string, number>();

  for (const row of rows) {
    const newSource = detectSource(
      row.original_email_from ?? "",
      row.original_email_subject ?? "",
      row.original_email_body ?? undefined
    );
    dist.set(newSource, (dist.get(newSource) ?? 0) + 1);
    if (newSource !== row.source) {
      changes.push({ id: row.id, oldSource: row.source, newSource });
    }
  }

  // פילוח שינויים: ישן → חדש
  const transitions = new Map<string, number>();
  for (const c of changes) {
    const key = `${c.oldSource ?? "(ריק)"} → ${c.newSource}`;
    transitions.set(key, (transitions.get(key) ?? 0) + 1);
  }

  console.log("── פילוח תיוג חדש (כלל הלידים עם מייל) ──");
  for (const [src, n] of [...dist.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(5)}  ${src}`);
  }

  console.log(`\n── שינויים (${changes.length} לידים) ──`);
  for (const [key, n] of [...transitions.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(5)}  ${key}`);
  }

  if (!APPLY) {
    console.log("\n(dry run — לא נכתב כלום. הוסף --apply כדי לעדכן)");
    return;
  }

  // עדכון בפועל — קיבוץ לפי source חדש, עדכון בצ'אנקים של 200 מזהים
  let updated = 0;
  const bySource = new Map<string, string[]>();
  for (const c of changes) {
    const arr = bySource.get(c.newSource) ?? [];
    arr.push(c.id);
    bySource.set(c.newSource, arr);
  }
  for (const [source, ids] of bySource) {
    for (let i = 0; i < ids.length; i += 200) {
      const chunk = ids.slice(i, i + 200);
      const { error } = await supabase.from("leads").update({ source }).in("id", chunk);
      if (error) throw new Error(`עדכון ל"${source}" נכשל: ${error.message}`);
      updated += chunk.length;
    }
  }
  console.log(`\n✓ עודכנו ${updated} לידים`);
}

main().catch((e) => {
  console.error("שגיאה:", e.message);
  process.exit(1);
});
