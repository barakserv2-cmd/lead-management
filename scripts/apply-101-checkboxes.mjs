// טוען את 101-checkboxes.json (מדף שמות המשבצות) לתבנית טופס 101:
// כל משבצת בשם הופכת לשאלת כן/לא עצמאית שה-✓ שלה מוטבע במשבצת.
//   node scripts/apply-101-checkboxes.mjs <101-checkboxes.json>
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
if (!file) { console.error("usage: node scripts/apply-101-checkboxes.mjs <101-checkboxes.json>"); process.exit(1); }
const input = JSON.parse(readFileSync(file, "utf-8"));
if (!Array.isArray(input.checkboxes) || input.checkboxes.length === 0) {
  console.error("קובץ לא תקין — אין checkboxes");
  process.exit(1);
}

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data: t } = await admin.from("signature_templates")
  .select("id, name, custom_fields, field_positions")
  .eq("file_path", "templates/form_101_2026.pdf").single();
if (!t) { console.error("תבנית 101 לא נמצאה"); process.exit(1); }

// מסירים גרסה קודמת של שאלות המשבצות (אם נטענה בעבר)
const customs = (t.custom_fields ?? []).filter((c) => !c.key.startsWith("custom_101chk_"));
const positions = (t.field_positions ?? []).filter((p) => !p.key.startsWith("custom_101chk_"));

input.checkboxes.forEach((cb, i) => {
  const key = `custom_101chk_${i}`;
  customs.push({
    key,
    label: cb.label,
    filler: "candidate",
    type: "choice",
    options: ["כן", "לא"],
    ...(cb.required ? {} : { required: false }),
  });
  // משבצת רק ל"כן" — "לא" לא מסמן כלום בטופס
  positions.push({ key: `${key}__0`, page: cb.box.page, x: cb.box.x, y: cb.box.y, w: cb.box.w, h: cb.box.h });
});

const { error } = await admin.from("signature_templates")
  .update({ custom_fields: customs, field_positions: positions })
  .eq("id", t.id);
if (error) { console.error("שגיאה:", error.message); process.exit(1); }
console.log(`✓ ${t.name} — ${input.checkboxes.length} שאלות משבצת נטענו (סה"כ ${positions.length} משבצות, ${customs.length} שדות מותאמים)`);
