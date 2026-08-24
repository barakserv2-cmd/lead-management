// One-off: seed saar@eilatjobs.com's Facebook groups into fb_groups.
// The list was read from his own joined-groups page (facebook.com/groups/joins).
// Idempotent — ON CONFLICT (owner_email, url) refreshes name/category only.
//   node scripts/seed-fb-groups.mjs
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

const OWNER = "saar@eilatjobs.com";

// category is what the /publishing board groups by; it is also the honest label
// for how a post should read there (a city community group is not a job board).
const GROUPS = [
  // --- דרושים אילת ---
  ["587591299262552",  "דרושים עכשיו - אילת :)",                                  "דרושים אילת"],
  ["1182048276740109", "דרושים אילת",                                             "דרושים אילת"],
  ["228081106527651",  "דרושים באילת",                                            "דרושים אילת"],
  ["81812166765",      "עבודה באילת",                                             "דרושים אילת"],
  ["947158385357709",  "עבודה באילת (2)",                                         "דרושים אילת"],
  // --- דרושים ארצי ---
  ["375613049675600",  "דרושים ומשרות עבודה ארצי",                                "דרושים ארצי"],
  ["129102877911572",  "דרושים עובדים בכל הארץ | מאגר משרות | חיפוש משרות",       "דרושים ארצי"],
  ["2396563787240920", "דרושים עובדים-כל הארץ-צפון, דרום, מרכז",                  "דרושים ארצי"],
  ["1374093172620548", "דרושים בכל רחבי הארץ",                                    "דרושים ארצי"],
  ["836148859763262",  "משרות דרושים ללא ניסיון ועם נסיון בכל תחום! מחפשים עבודה?", "דרושים ארצי"],
  ["employers972",     "מחפשי עבודה בישראל",                                      "דרושים ארצי"],
  ["1770081143313822", "דרושים - עובדים , עבודות מפה לאוזן",                      "דרושים ארצי"],
  ["1606735556215678", "דרושים עבודה מפה לאוזן",                                  "דרושים ארצי"],
  ["1587590338212583", "דרושים - עבודות זמניות",                                  "דרושים ארצי"],
  // --- דרושים אזורי (מקור לעובדים שעוברים לאילת) ---
  ["JOBS.ASHDOD",      "דרושים אשדוד והסביבה",                                    "דרושים אזורי"],
  ["1291075921033922", "דרושים \\ מחפשי עבודה אשקלון והסביבה",                    "דרושים אזורי"],
  ["1807335816219479", "דרושים תל אביב",                                          "דרושים אזורי"],
  // --- קהילות אילת (לא לוחות דרושים - פוסט צריך להיקרא אחרת) ---
  ["340359701002871",  "אילת העיר שלנו 40K",                                      "קהילת אילת"],
  ["iLoveEilat",       "אילת העיר שלי",                                           "קהילת אילת"],
  ["620680954760887",  "כל אילת חברים",                                           "קהילת אילת"],
  ["527043906291828",  "אילת שלנו",                                               "קהילת אילת"],
  ["eilat.il",         "אילת - Eilat",                                            "קהילת אילת"],
  ["901717446583024",  "פורום אילתים מפרסמים",                                    "קהילת אילת"],
  ["1419680568340229", "אילתים משתפים את כולם",                                   "קהילת אילת"],
  ["1393565677558414", "אילתי בפייס eilat people",                                "קהילת אילת"],
];

const COMMUNITY_RULE =
  "קבוצת קהילה, לא לוח דרושים - לפרסם בטון אישי ובתדירות נמוכה, אחרת מדווחים.";

const ref = process.env.NEXT_PUBLIC_SUPABASE_URL.match(/https:\/\/([a-z0-9]+)\.supabase\.co/)[1];
const client = new pg.Client({
  host: "aws-0-eu-central-1.pooler.supabase.com", port: 5432, database: "postgres",
  user: `postgres.${ref}`,
  password: process.env.FRANKFURT_DB_PASSWORD_REAL || process.env.FRANKFURT_DB_PASSWORD,
  ssl: { rejectUnauthorized: false },
});

await client.connect();
let inserted = 0, updated = 0;
for (const [id, name, category] of GROUPS) {
  const url = `https://www.facebook.com/groups/${id}/`;
  const community = category === "קהילת אילת";
  const res = await client.query(
    `INSERT INTO public.fb_groups (owner_email, name, url, category, cooldown_hours, rules)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (owner_email, url)
     DO UPDATE SET name = EXCLUDED.name, category = EXCLUDED.category
     RETURNING (xmax = 0) AS is_insert`,
    [OWNER, name, url, category, community ? 72 : 24, community ? COMMUNITY_RULE : null]
  );
  res.rows[0].is_insert ? inserted++ : updated++;
}
console.log(`inserted: ${inserted}, updated: ${updated}, total: ${GROUPS.length}`);
await client.end();
