// Apply a single migration file to the Frankfurt Supabase DB via pg.
//   node scripts/apply-migration.mjs supabase/migrations/00045_privacy_audit_and_retention.sql
// Reads FRANKFURT_DB_PASSWORD_REAL from .env.migration and the project ref
// from NEXT_PUBLIC_SUPABASE_URL in .env.local. Runs the file in one transaction.
import { readFileSync } from "fs";
import pg from "pg";

function loadEnv(path) {
  const txt = readFileSync(path, "utf-8").replace(/^﻿/, "");
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, "");
  }
}
loadEnv(new URL("../.env.local", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
loadEnv(new URL("../.env.migration", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));

const file = process.argv[2];
if (!file) { console.error("usage: node scripts/apply-migration.mjs <sql-file>"); process.exit(1); }

const ref = process.env.NEXT_PUBLIC_SUPABASE_URL.match(/https:\/\/([a-z0-9]+)\.supabase\.co/)[1];
const pw = process.env.FRANKFURT_DB_PASSWORD_REAL || process.env.FRANKFURT_DB_PASSWORD;
const hosts = ["aws-0-eu-central-1.pooler.supabase.com", "aws-1-eu-central-1.pooler.supabase.com"];

const sql = readFileSync(file, "utf-8");
let lastErr;
for (const host of hosts) {
  const client = new pg.Client({
    host, port: 5432, database: "postgres",
    user: `postgres.${ref}`, password: pw,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
  });
  try {
    await client.connect();
    console.log("connected via", host);
    await client.query("BEGIN");
    await client.query(sql);
    await client.query("COMMIT");
    console.log("applied:", file);
    await client.end();
    process.exit(0);
  } catch (e) {
    lastErr = e;
    try { await client.query("ROLLBACK"); } catch { /* ignore */ }
    try { await client.end(); } catch { /* ignore */ }
    console.warn(`failed via ${host}:`, e.message);
  }
}
console.error("migration failed:", lastErr?.message);
process.exit(1);
