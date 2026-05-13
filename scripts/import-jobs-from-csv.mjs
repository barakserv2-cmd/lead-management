// One-off importer: wipes jobs, ensures clients exist, then imports jobs from
// the Google-Sheet CSV the user shared.
//
// Run: node scripts/import-jobs-from-csv.mjs
//
// Requires: SUPABASE_ACCESS_TOKEN env var set to a Supabase PAT (sbp_...).

import { readFileSync } from "fs";
import XLSX from "xlsx";

const PROJECT_REF = "yvmnaprzaacwgkxkuuxm";
const PAT = process.env.SUPABASE_ACCESS_TOKEN;
if (!PAT) {
  console.error("Missing SUPABASE_ACCESS_TOKEN env var (sbp_...)");
  process.exit(1);
}

const CSV_PATH = process.argv[2] ?? "/tmp/jobs.csv";

// ─── parse CSV ───────────────────────────────────────────────
const csv = readFileSync(CSV_PATH, "utf8");
const wb = XLSX.read(csv, { type: "string" });
const ws = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(ws, { defval: "", raw: false });

const HEADER_TOKENS = new Set(["מלון/רשת", "מלון / רשת", "מלון"]);

const cleaned = [];
for (const r of rows) {
  // The sheet has multiple aliases for the client column header
  const clientRaw = String(r["מלון/רשת"] ?? r["מלון / רשת"] ?? "").trim();
  const titleRaw = String(r["משרה"] ?? r["משרה "] ?? "").trim();
  if (!clientRaw || !titleRaw) continue;
  if (HEADER_TOKENS.has(clientRaw)) continue; // duplicate header rows
  cleaned.push({
    client: clientRaw,
    title: titleRaw,
    pay: String(r["שכר"] ?? "").trim(),
    bonus: String(r["בונוסים / מענקים"] ?? "").trim(),
    housing: String(r["מגורים"] ?? "").trim(),
    language: String(r["דרישות שפה"] ?? "").trim(),
    notes: String(r["הערות"] ?? "").trim(),
  });
}

console.log(`Parsed ${cleaned.length} job rows.`);

const uniqueClients = [...new Set(cleaned.map((r) => r.client))].sort();
console.log(`Unique clients: ${uniqueClients.length}`);
console.log(uniqueClients.map((c) => "  - " + c).join("\n"));

// ─── build SQL ───────────────────────────────────────────────
function sql(strings, ...values) {
  // simple SQL literal escape
  return strings.reduce((acc, s, i) => {
    if (i === values.length) return acc + s;
    const v = values[i];
    if (v === null || v === undefined || v === "") return acc + s + "NULL";
    return acc + s + "'" + String(v).replace(/'/g, "''") + "'";
  }, "");
}

const statements = [];

// 1. Wipe jobs
statements.push(`DELETE FROM jobs;`);

// 2. Upsert clients (idempotent on name)
//    Use a placeholder phone with a unique suffix so the UNIQUE constraint
//    doesn't bite when two imports run.
for (const name of uniqueClients) {
  const phonePlaceholder = "IMPORT-" + name.replace(/\s+/g, "-");
  statements.push(
    sql`INSERT INTO clients (name, phone, type, status) VALUES (${name}, ${phonePlaceholder}, 'Hotel', 'Active') ON CONFLICT (phone) DO UPDATE SET name = EXCLUDED.name;`
  );
}

// 3. Insert jobs, looking up client_id by name
for (const r of cleaned) {
  const noteParts = [];
  if (r.bonus) noteParts.push("בונוסים: " + r.bonus);
  if (r.housing) noteParts.push("מגורים: " + r.housing);
  if (r.notes) noteParts.push(r.notes);
  const notes = noteParts.join(" | ") || null;
  const requirements = r.language ? "ARRAY[" + sql`${r.language}` + "]::TEXT[]" : "'{}'::TEXT[]";
  // Use a subquery for client_id
  statements.push(
    `INSERT INTO jobs (client_id, title, pay_rate, requirements, notes, status) ` +
      `VALUES ((SELECT id FROM clients WHERE name = ${sqlLit(r.client)} LIMIT 1), ` +
      `${sqlLit(r.title)}, ${sqlLit(r.pay || null)}, ${requirements}, ${sqlLit(notes)}, 'Open');`
  );
}

function sqlLit(v) {
  if (v === null || v === undefined || v === "") return "NULL";
  return "'" + String(v).replace(/'/g, "''") + "'";
}

// ─── execute via Management API ─────────────────────────────
const query = statements.join("\n");
console.log(`\nSubmitting ${statements.length} statements to Management API...`);

const res = await fetch(
  `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${PAT}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  }
);

const body = await res.text();
console.log(`HTTP ${res.status}`);
if (!res.ok) {
  console.error(body);
  process.exit(1);
}
console.log("Done.");
console.log(body.slice(0, 500));
