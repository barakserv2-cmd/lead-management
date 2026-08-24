// One-off: rewrite body_snapshot for queued publications with the new clean CTA
// (short wa.me prefill, no robotic code line). Only touches status='queued' —
// posted rows are historical and must not change. Idempotent.
//   node scripts/rebuild-queued-snapshots.mjs
import { readFileSync } from "fs";
import pg from "pg";
function loadEnv(p){const t=readFileSync(p,"utf-8").replace(/^﻿/,"");for(const l of t.split(/\r?\n/)){const m=l.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);if(m&&!process.env[m[1]])process.env[m[1]]=m[2].trim().replace(/^"|"$/g,"");}}
loadEnv(new URL("../.env.local", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,"$1"));
loadEnv(new URL("../.env.migration", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,"$1"));

function waNumber(p){const d=p.replace(/\D/g,"");if(d.startsWith("972"))return d;if(d.startsWith("0"))return "972"+d.slice(1);return d;}

// Strip the OLD ugly tail (encoded link line + "קוד משרה" line) and rebuild clean.
function rebuild(oldSnapshot, phone, code) {
  let body = oldSnapshot
    .replace(/\n+👈[^\n]*\n?https?:\/\/wa\.me\/\S+/g, "")   // old "👈 לפרטים...: <link>"
    .replace(/\n+👈[^\n]*https?:\/\/wa\.me\/\S+/g, "")
    .replace(/\n+👇[^\n]*\n?https?:\/\/wa\.me\/\S+/g, "")   // already-new link, avoid dupes
    .replace(/\n+קוד משרה:\s*\S+/g, "")
    .trimEnd();
  const link = phone ? `https://wa.me/${waNumber(phone)}?text=${code}` : null;
  if (link && !body.includes(link)) body += `\n\n👇 שליחת הודעה בוואטסאפ:\n${link}`;
  return body;
}

const ref = process.env.NEXT_PUBLIC_SUPABASE_URL.match(/https:\/\/([a-z0-9]+)\.supabase\.co/)[1];
const client = new pg.Client({ host:"aws-0-eu-central-1.pooler.supabase.com", port:5432, database:"postgres", user:`postgres.${ref}`, password: process.env.FRANKFURT_DB_PASSWORD_REAL||process.env.FRANKFURT_DB_PASSWORD, ssl:{rejectUnauthorized:false} });
await client.connect();

const { rows } = await client.query(`
  SELECT p.id, p.body_snapshot, p.tracking_code, p.owner_email,
         COALESCE(w.phone, s.contact_phone) AS phone
    FROM public.fb_publications p
    LEFT JOIN public.whatsapp_accounts w ON w.user_email = p.owner_email AND w.is_active
    CROSS JOIN (SELECT contact_phone FROM public.publishing_settings WHERE id=1) s
   WHERE p.status='queued'`);

let updated = 0;
for (const r of rows) {
  const fresh = rebuild(r.body_snapshot, r.phone, r.tracking_code);
  if (fresh !== r.body_snapshot) {
    await client.query(`UPDATE public.fb_publications SET body_snapshot=$1 WHERE id=$2`, [fresh, r.id]);
    updated++;
  }
}
console.log(`queued: ${rows.length}, rewritten: ${updated}`);
await client.end();
