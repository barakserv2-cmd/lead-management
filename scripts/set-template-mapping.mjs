// טעינת קובץ מיפוי משבצות (מכלי הסימון barak-signature-mapper.html)
// לתבנית חתימה:
//   node scripts/set-template-mapping.mjs <mapping-file.json>
// הקובץ: { "template": "<slug>", "fields": [{key,page,x,y,w,h}, ...] }
// ה-slug הוא שם הקובץ ב-storage: templates/<slug>.pdf
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
if (!file) {
  console.error("usage: node scripts/set-template-mapping.mjs <mapping-file.json>");
  process.exit(1);
}
const mapping = JSON.parse(readFileSync(file, "utf-8"));
if (!mapping.template || !Array.isArray(mapping.fields) || mapping.fields.length === 0) {
  console.error("קובץ מיפוי לא תקין — חסר template או fields");
  process.exit(1);
}

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const filePath = `templates/${mapping.template}.pdf`;
const { data, error } = await admin
  .from("signature_templates")
  .update({ field_positions: mapping.fields })
  .eq("file_path", filePath)
  .select("name")
  .maybeSingle();
if (error) {
  console.error("שגיאה:", error.message);
  process.exit(1);
}
if (!data) {
  console.error(`לא נמצאה תבנית עם file_path=${filePath}`);
  process.exit(1);
}
console.log(`✓ מיפוי נטען לתבנית "${data.name}" — ${mapping.fields.length} משבצות`);
