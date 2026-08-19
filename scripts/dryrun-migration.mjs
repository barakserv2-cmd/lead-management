// Dry-run a migration: BEGIN → run file → run probe SQL → ROLLBACK.
//   node scripts/dryrun-migration.mjs <sql-file> "<probe sql>"
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
const [file, probe] = process.argv.slice(2);
const ref = process.env.NEXT_PUBLIC_SUPABASE_URL.match(/https:\/\/([a-z0-9]+)\.supabase\.co/)[1];
const client = new pg.Client({
  host: "aws-0-eu-central-1.pooler.supabase.com", port: 5432, database: "postgres",
  user: `postgres.${ref}`, password: process.env.FRANKFURT_DB_PASSWORD_REAL || process.env.FRANKFURT_DB_PASSWORD,
  ssl: { rejectUnauthorized: false },
});
client.on("notice", (n) => console.log("NOTICE:", n.message));
await client.connect();
try {
  await client.query("BEGIN");
  await client.query(readFileSync(file, "utf-8"));
  if (probe) { const r = await client.query(probe); console.log(JSON.stringify(r.rows, null, 1)); }
} catch (e) { console.error("ERROR:", e.message); }
finally { await client.query("ROLLBACK"); console.log("rolled back"); await client.end(); }
