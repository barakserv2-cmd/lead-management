// Read-only helper: run one SQL statement against the Frankfurt DB and print JSON.
//   node scripts/db-query.mjs "select count(*) from leads"
// Same env loading as apply-migration.mjs.
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

const sql = process.argv[2];
if (!sql) { console.error("usage: node scripts/db-query.mjs \"<sql>\""); process.exit(1); }

const ref = process.env.NEXT_PUBLIC_SUPABASE_URL.match(/https:\/\/([a-z0-9]+)\.supabase\.co/)[1];
const client = new pg.Client({
  host: "aws-0-eu-central-1.pooler.supabase.com", port: 5432, database: "postgres",
  user: `postgres.${ref}`, password: process.env.FRANKFURT_DB_PASSWORD_REAL || process.env.FRANKFURT_DB_PASSWORD,
  ssl: { rejectUnauthorized: false },
});
await client.connect();
const r = await client.query(sql);
console.log(JSON.stringify(r.rows, null, 1));
await client.end();
