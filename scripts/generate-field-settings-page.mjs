// מייצר את דף הגדרות השדות (חובה/רשות) מהמצב הנוכחי ב-DB:
//   node scripts/generate-field-settings-page.mjs <output.html>
// סער פותח את הדף, מחליף מתגים, לוחץ שמירה — יורד hatima-fields.json
// שנטען עם scripts/apply-field-settings.mjs
import { readFileSync, writeFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";

function loadEnv(path) {
  const txt = readFileSync(path, "utf-8").replace(/^﻿/, "");
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, "");
  }
}
loadEnv(new URL("../.env.local", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));

const LABELS = {
  full_name: "שם מלא", id_number: "תעודת זהות", birth_date: "תאריך לידה",
  address: "כתובת מגורים", phone: "טלפון נייד", email: "אימייל",
  bank_name: "בנק", bank_branch: "מספר סניף", bank_account: "מספר חשבון",
};

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data: templates } = await admin
  .from("signature_templates")
  .select("file_path, name, required_fields, optional_fields, custom_fields")
  .eq("is_active", true)
  .order("sort_order");

const state = templates.map((t) => ({
  file_path: t.file_path,
  name: t.name,
  fields: [
    ...(t.required_fields ?? []).map((k) => ({
      key: k,
      label: LABELS[k] ?? k,
      kind: "standard",
      required: !(t.optional_fields ?? []).includes(k),
      locked: k === "full_name" || k === "id_number",
    })),
    ...(t.custom_fields ?? [])
      .filter((c) => c.filler === "candidate")
      .map((c) => ({
        key: c.key,
        label: c.label + (c.type === "choice" ? " (סימון)" : ""),
        kind: "custom",
        required: c.required !== false,
        locked: false,
      })),
  ],
}));

const html = `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>הגדרת שדות חובה — ברק שירותים</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Arial, sans-serif; background: #f1f5f9; color: #0f172a; padding: 20px 12px 100px; }
  .wrap { max-width: 620px; margin: 0 auto; }
  h1 { font-size: 20px; color: #0e7490; margin-bottom: 4px; }
  .hint { font-size: 12px; color: #64748b; margin-bottom: 18px; }
  .card { background: #fff; border-radius: 14px; box-shadow: 0 2px 10px rgba(0,0,0,.06); margin-bottom: 16px; overflow: hidden; }
  .card h2 { font-size: 15px; padding: 12px 16px; background: #ecfeff; color: #0e7490; }
  .row { display: flex; align-items: center; justify-content: space-between; padding: 9px 16px; border-top: 1px solid #f1f5f9; }
  .row .lbl { font-size: 14px; }
  .row .tag { font-size: 10px; color: #94a3b8; margin-inline-start: 6px; }
  .toggle { display: flex; border: 1px solid #cbd5e1; border-radius: 999px; overflow: hidden; }
  .toggle button { border: none; background: #fff; padding: 5px 14px; font-size: 12px; cursor: pointer; font-family: inherit; }
  .toggle button.req.on { background: #dc2626; color: #fff; font-weight: 700; }
  .toggle button.opt.on { background: #16a34a; color: #fff; font-weight: 700; }
  .locked { font-size: 11px; color: #94a3b8; }
  #saveBar { position: fixed; bottom: 0; right: 0; left: 0; background: #fff; border-top: 2px solid #0e7490; padding: 12px; text-align: center; }
  #saveBtn { background: #16a34a; color: #fff; border: none; border-radius: 10px; padding: 10px 40px; font-size: 15px; font-weight: 700; cursor: pointer; font-family: inherit; }
</style>
</head>
<body>
<div class="wrap">
  <h1>⚙️ הגדרת שדות חובה / רשות</h1>
  <div class="hint">
    <b style="color:#dc2626">חובה</b> — המועמד לא יכול לחתום בלי למלא ·
    <b style="color:#16a34a">רשות</b> — אפשר לדלג, המשבצת תישאר ריקה.
    בסוף: "שמור הגדרות" ושלח לי את הקובץ שיורד.
  </div>
  <div id="cards"></div>
</div>
<div id="saveBar"><button id="saveBtn">💾 שמור הגדרות</button></div>
<script>
const state = ${JSON.stringify(state)};
const cards = document.getElementById("cards");
for (const t of state) {
  const card = document.createElement("div");
  card.className = "card";
  card.innerHTML = "<h2>📄 " + t.name + "</h2>";
  for (const f of t.fields) {
    const row = document.createElement("div");
    row.className = "row";
    const lbl = document.createElement("div");
    lbl.className = "lbl";
    lbl.innerHTML = f.label + (f.kind === "custom" ? '<span class="tag">שדה שלך</span>' : "");
    row.appendChild(lbl);
    if (f.locked) {
      const l = document.createElement("div");
      l.className = "locked";
      l.textContent = "חובה תמיד 🔒";
      row.appendChild(l);
    } else {
      const tg = document.createElement("div");
      tg.className = "toggle";
      const mk = (cls, text, val) => {
        const b = document.createElement("button");
        b.className = cls + (f.required === val ? " on" : "");
        b.textContent = text;
        b.onclick = () => { f.required = val; render(tg, f); };
        return b;
      };
      const render = (el, fld) => {
        el.innerHTML = "";
        el.appendChild(mk("req", "חובה", true));
        el.appendChild(mk("opt", "רשות", false));
      };
      render(tg, f);
      row.appendChild(tg);
    }
    card.appendChild(row);
  }
  cards.appendChild(card);
}
document.getElementById("saveBtn").onclick = () => {
  const out = state.map((t) => ({
    file_path: t.file_path,
    optional_standard: t.fields.filter((f) => f.kind === "standard" && !f.required && !f.locked).map((f) => f.key),
    custom_required: Object.fromEntries(t.fields.filter((f) => f.kind === "custom").map((f) => [f.key, f.required])),
  }));
  const blob = new Blob([JSON.stringify(out, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "hatima-fields.json";
  a.click();
};
</script>
</body>
</html>`;

writeFileSync(process.argv[2] ?? "hatima-fields.html", html);
console.log("page written:", process.argv[2], "| templates:", state.length, "| fields:", state.reduce((n, t) => n + t.fields.length, 0));
