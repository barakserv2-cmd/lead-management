// טוען את hatima-fields.json (מדף הגדרות השדות) לתבניות:
//   node scripts/apply-field-settings.mjs <hatima-fields.json>
import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";

function loadEnv(path) {
  const txt = readFileSync(path, "utf-8").replace(/^﻿/, "");
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, "");
  }
}
loadEnv(new URL("../.env.local", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));

const file = process.argv[2];
if (!file) { console.error("usage: node scripts/apply-field-settings.mjs <hatima-fields.json>"); process.exit(1); }
const settings = JSON.parse(readFileSync(file, "utf-8"));
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

for (const t of settings) {
  const { data: row } = await admin.from("signature_templates")
    .select("id, name, custom_fields").eq("file_path", t.file_path).maybeSingle();
  if (!row) { console.error("לא נמצאה תבנית:", t.file_path); continue; }
  // שם מלא ות"ז לעולם חובה
  const optional = (t.optional_standard ?? []).filter((k) => k !== "full_name" && k !== "id_number");
  const customs = (row.custom_fields ?? []).map((c) => {
    if (c.filler !== "candidate" || !(c.key in (t.custom_required ?? {}))) return c;
    const { required, ...rest } = c;
    return t.custom_required[c.key] ? rest : { ...rest, required: false };
  });
  const { error } = await admin.from("signature_templates")
    .update({ optional_fields: optional, custom_fields: customs })
    .eq("id", row.id);
  if (error) { console.error("שגיאה:", row.name, error.message); continue; }
  console.log(`✓ ${row.name} — רשות: ${optional.length + customs.filter((c) => c.required === false).length} שדות`);
}
