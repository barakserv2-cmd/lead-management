// הצלבת לידים קיימים מול תיבת barakserv2: לכל ליד בלי מייל מקורי,
// מחפשים בתיבה את המייל שדרכו הוא נכנס (לפי טלפון, ואם אין — אימייל),
// מזהים גורם גיוס לפי המילון, ומעדכנים source + שדות original_email_*.
//
// הרצה: npx tsx scripts/crossref-inbox.ts [--apply] [--limit=N]
//   בלי --apply = dry run (מחפש בתיבה אבל לא כותב לדאטהבייס)
import { readFileSync, appendFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";

const envFile = readFileSync("C:/Users/Barak/Projects/lead-management/.env.local", "utf-8")
  .replace(/^\uFEFF/, "");
for (const line of envFile.split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, "");
}
// gmail.ts דורש NEXT_PUBLIC_APP_URL — קיים ב-env.local

const APPLY = process.argv.includes("--apply");
const limitArg = process.argv.find((a) => a.startsWith("--limit="));
const LIMIT = limitArg ? parseInt(limitArg.split("=")[1], 10) : Infinity;
const LOG_FILE = "C:/Users/Barak/Projects/lead-management/scripts/crossref-progress.log";

function log(msg: string) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  try { appendFileSync(LOG_FILE, line + "\n"); } catch {}
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// וריאציות טלפון כפי שמופיעות במיילים: 0524559076 / 052-4559076 / +972524559076
function phoneVariants(phone: string): string[] {
  const digits = phone.replace(/[^\d]/g, "").replace(/^972/, "0");
  if (!/^0\d{8,9}$/.test(digits)) return [];
  const dashed = `${digits.slice(0, 3)}-${digits.slice(3)}`;
  const intl = `+972${digits.slice(1)}`;
  return [digits, dashed, intl];
}

async function main() {
  const { getGmailClient, detectSource } = await import(
    new URL("../src/lib/gmail.ts", import.meta.url).href
  );
  const gmail = await getGmailClient();

  type Lead = { id: string; name: string; phone: string | null; email: string | null; source: string | null };
  const leads: Lead[] = [];
  for (let fromIdx = 0; ; fromIdx += 1000) {
    const { data, error } = await supabase
      .from("leads")
      .select("id, name, phone, email, source")
      .is("original_email_subject", null)
      .order("created_at", { ascending: false })
      .range(fromIdx, fromIdx + 999);
    if (error) throw new Error(error.message);
    leads.push(...(data as Lead[]));
    if (!data || data.length < 1000) break;
  }

  const candidates = leads
    .filter((l) => (l.phone && !l.phone.startsWith("no-phone-")) || l.email)
    .slice(0, LIMIT);

  log(`${leads.length} לידים בלי מייל מקורי, ${candidates.length} ניתנים להצלבה (limit=${LIMIT === Infinity ? "אין" : LIMIT}, apply=${APPLY})`);

  const stats = { found: 0, notFound: 0, changed: 0, errors: 0 };
  const transitions = new Map<string, number>();

  for (let i = 0; i < candidates.length; i++) {
    const lead = candidates[i];
    try {
      // בניית שאילתת חיפוש: וריאציות טלפון או כתובת אימייל
      const terms: string[] = [];
      if (lead.phone && !lead.phone.startsWith("no-phone-")) {
        terms.push(...phoneVariants(lead.phone).map((v) => `"${v}"`));
      }
      if (terms.length === 0 && lead.email) terms.push(`"${lead.email}"`);
      if (terms.length === 0) { stats.notFound++; continue; }

      const q = terms.join(" OR ");
      const listRes = await gmail.users.messages.list({ userId: "me", q, maxResults: 8 });
      const msgIds = (listRes.data.messages ?? []).map((m: { id?: string | null }) => m.id!).filter(Boolean);

      if (msgIds.length === 0) { stats.notFound++; continue; }

      // שולפים את המיילים, מזהים מקור לכל אחד, ובוחרים את הטוב ביותר:
      // עדיפות למייל-ליד אמיתי (לא התראת שיחה), ומביניהם — הישן ביותר.
      type Hit = { source: string; subject: string; from: string; body: string; date: number; id: string };
      const hits: Hit[] = [];
      for (const id of msgIds) {
        const full = await gmail.users.messages.get({ userId: "me", id, format: "full" });
        const headers = full.data.payload?.headers ?? [];
        const subject = headers.find((h: { name?: string | null }) => h.name?.toLowerCase() === "subject")?.value ?? "";
        const from = headers.find((h: { name?: string | null }) => h.name?.toLowerCase() === "from")?.value ?? "";
        const date = Number(full.data.internalDate ?? 0);
        const body = full.data.snippet ?? "";
        const source = detectSource(from, subject, body);
        if (source !== "אימייל ישיר") hits.push({ source, subject, from, body, date, id });
      }

      if (hits.length === 0) { stats.notFound++; continue; }

      const leadMails = hits.filter((h) => h.source !== "טלפון");
      const pool = leadMails.length > 0 ? leadMails : hits;
      pool.sort((a, b) => a.date - b.date);
      const best = pool[0];

      stats.found++;
      if (best.source !== lead.source) {
        stats.changed++;
        const key = `${lead.source ?? "(ריק)"} → ${best.source}`;
        transitions.set(key, (transitions.get(key) ?? 0) + 1);

        if (APPLY) {
          const { error } = await supabase
            .from("leads")
            .update({
              source: best.source,
              original_email_id: best.id,
              original_email_subject: best.subject,
              original_email_from: best.from,
            })
            .eq("id", lead.id);
          if (error) {
            // כפילות מועמד: ליד אחר כבר מחזיק את המייל הזה. מעדכנים
            // את המקור בלבד; משאירים original_email_id פנוי כדי לא
            // להפר את אילוץ הייחודיות.
            if (error.message.includes("leads_original_email_id_key")) {
              const { error: fallbackErr } = await supabase
                .from("leads")
                .update({
                  source: best.source,
                  original_email_subject: best.subject,
                  original_email_from: best.from,
                })
                .eq("id", lead.id);
              if (fallbackErr) throw new Error(fallbackErr.message);
            } else {
              throw new Error(error.message);
            }
          }
        }
      }
    } catch (e) {
      stats.errors++;
      log(`שגיאה בליד ${lead.id} (${lead.name}): ${e instanceof Error ? e.message : e}`);
      // האטה קלה אחרי שגיאה (למקרה של rate limit)
      await new Promise((r) => setTimeout(r, 2000));
    }

    if ((i + 1) % 50 === 0) {
      log(`התקדמות: ${i + 1}/${candidates.length} | נמצאו: ${stats.found} | שינויים: ${stats.changed} | לא נמצאו: ${stats.notFound} | שגיאות: ${stats.errors}`);
    }
  }

  log(`\n── סיכום ──`);
  log(`נמצא מייל מקורי: ${stats.found} | ללא התאמה בתיבה: ${stats.notFound} | שגיאות: ${stats.errors}`);
  log(`שינויי תיוג${APPLY ? " (נכתבו)" : " (dry run)"}: ${stats.changed}`);
  for (const [key, n] of [...transitions.entries()].sort((a, b) => b[1] - a[1])) {
    log(`  ${String(n).padStart(5)}  ${key}`);
  }
}

main().catch((e) => { log(`שגיאה קריטית: ${e.message}`); process.exit(1); });
