/**
 * Import jobs from CSV into Supabase.
 *
 * Usage:
 *   node scripts/import-jobs.mjs path/to/requirements_2025.csv
 *
 * CSV format (with header row):
 *   Client, Role, Pay, Count
 *
 * The script fuzzy-matches each Client name against the `clients` table
 * and inserts matching rows into the `jobs` table.
 */

import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ── Fuzzy matching ──────────────────────────────────────────

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function findBestMatch(name, clients) {
  const normalized = name.trim().toLowerCase();

  // Try exact match first
  const exact = clients.find((c) => c.name.toLowerCase() === normalized);
  if (exact) return exact;

  // Try substring/includes match
  const includes = clients.find(
    (c) =>
      c.name.toLowerCase().includes(normalized) ||
      normalized.includes(c.name.toLowerCase())
  );
  if (includes) return includes;

  // Fuzzy match with Levenshtein distance
  let bestClient = null;
  let bestScore = Infinity;
  for (const c of clients) {
    const dist = levenshtein(normalized, c.name.toLowerCase());
    const maxLen = Math.max(normalized.length, c.name.length);
    // Accept if distance is less than 40% of the longer string
    if (dist < bestScore && dist / maxLen < 0.4) {
      bestScore = dist;
      bestClient = c;
    }
  }
  return bestClient;
}

// ── CSV parsing ─────────────────────────────────────────────

function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) {
    console.error("CSV must have a header row and at least one data row.");
    process.exit(1);
  }

  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const clientIdx = headers.findIndex((h) => h.includes("client"));
  const roleIdx = headers.findIndex((h) => h.includes("role") || h.includes("title"));
  const payIdx = headers.findIndex((h) => h.includes("pay") || h.includes("rate") || h.includes("salary"));
  const countIdx = headers.findIndex((h) => h.includes("count") || h.includes("needed") || h.includes("workers"));

  if (clientIdx === -1 || roleIdx === -1) {
    console.error("CSV must have at least 'Client' and 'Role' columns.");
    console.error("Found headers:", headers);
    process.exit(1);
  }

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",").map((c) => c.trim());
    rows.push({
      client: cols[clientIdx] || "",
      role: cols[roleIdx] || "",
      pay: payIdx !== -1 ? cols[payIdx] || "" : "",
      count: countIdx !== -1 ? parseInt(cols[countIdx], 10) || 1 : 1,
    });
  }
  return rows;
}

// ── Main ────────────────────────────────────────────────────

async function main() {
  const csvPath = process.argv[2];
  if (!csvPath) {
    console.error("Usage: node scripts/import-jobs.mjs <path-to-csv>");
    process.exit(1);
  }

  // Read CSV
  const csvText = readFileSync(resolve(csvPath), "utf-8");
  const rows = parseCSV(csvText);
  console.log(`Parsed ${rows.length} rows from CSV.\n`);

  // Fetch all clients
  const { data: clients, error: clientsErr } = await supabase
    .from("clients")
    .select("id, name");

  if (clientsErr) {
    console.error("Failed to fetch clients:", clientsErr.message);
    process.exit(1);
  }
  console.log(`Found ${clients.length} clients in database.\n`);

  // Process each row
  let inserted = 0;
  let skipped = 0;

  for (const row of rows) {
    if (!row.client || !row.role) {
      console.log(`  SKIP (empty client/role): "${row.client}" / "${row.role}"`);
      skipped++;
      continue;
    }

    const match = findBestMatch(row.client, clients);
    if (!match) {
      console.log(`  NO MATCH for client "${row.client}" — skipping`);
      skipped++;
      continue;
    }

    console.log(`  "${row.client}" → matched "${match.name}" (id: ${match.id.slice(0, 8)}...)`);

    const { error: insertErr } = await supabase.from("jobs").insert({
      client_id: match.id,
      title: row.role,
      needed_count: Math.max(1, row.count),
      pay_rate: row.pay || null,
    });

    if (insertErr) {
      console.log(`    ERROR inserting: ${insertErr.message}`);
      skipped++;
    } else {
      console.log(`    Inserted: "${row.role}" (${row.count} workers, ${row.pay || "no pay specified"})`);
      inserted++;
    }
  }

  console.log(`\nDone! Inserted: ${inserted}, Skipped: ${skipped}`);
}

main();
