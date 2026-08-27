// השלמה חד-פעמית: שיחות מסקיו שהסקרייפר החריג (-from:maskyoo.co.il, הוסר
// ב-08/2026) — כל מתקשר מהתקופה האחרונה שלא קיים במערכת נכנס כליד "טלפון".
// מתקשר עם כמה שיחות = ליד אחד (מעדיפים שיחה שנענתה, הארוכה ביותר).
//
// הרצה: npx tsx scripts/backfill-maskyoo.ts [--apply] [--days=N]
//   בלי --apply = dry run (מדפיס מה היה נכנס, לא כותב לדאטהבייס)
import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";

const envFile = readFileSync("C:/Users/Barak/Projects/lead-management/.env.local", "utf-8")
  .replace(/^\uFEFF/, "");
for (const line of envFile.split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, "");
}

const APPLY = process.argv.includes("--apply");
const daysArg = process.argv.find((a) => a.startsWith("--days="));
const DAYS = daysArg ? parseInt(daysArg.split("=")[1], 10) : 15;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  const gmailLib = await import(new URL("../src/lib/gmail.ts", import.meta.url).href);
  const { fetchEmailsByQuery, parseMaskyooCall, INTERNAL_PHONE_NUMBERS } = gmailLib;
  const { normalizePhone } = await import(new URL("../src/lib/phone.ts", import.meta.url).href);
  const { LEAD_STATUSES } = await import(new URL("../src/lib/constants.ts", import.meta.url).href);

  const emails = await fetchEmailsByQuery(`from:maskyoo.co.il newer_than:${DAYS}d`, 500);
  console.log(`${emails.length} מיילי מסקיו ב-${DAYS} הימים האחרונים (apply=${APPLY})`);

  // קיבוץ לפי מתקשר — שיחה שנענתה (הארוכה ביותר) מנצחת, אחרת האחרונה
  type Entry = { email: (typeof emails)[number]; call: NonNullable<ReturnType<typeof parseMaskyooCall>>; calls: number };
  const byCaller = new Map<string, Entry>();
  let unparsed = 0;
  for (const email of emails) {
    const call = parseMaskyooCall(email.body);
    if (!call) {
      unparsed++;
      console.log(`  ⚠ לא פוענח: ${email.id} "${email.subject}"`);
      continue;
    }
    const phone = normalizePhone(call.caller);
    if (!phone) continue;
    if (INTERNAL_PHONE_NUMBERS.has(phone)) continue;

    const existing = byCaller.get(phone);
    if (!existing) {
      byCaller.set(phone, { email, call, calls: 1 });
      continue;
    }
    existing.calls++;
    const better =
      (call.status === "ANSWER" && existing.call.status !== "ANSWER") ||
      (call.status === "ANSWER" &&
        existing.call.status === "ANSWER" &&
        (call.durationSeconds ?? 0) > (existing.call.durationSeconds ?? 0)) ||
      (call.status !== "ANSWER" &&
        existing.call.status !== "ANSWER" &&
        new Date(email.date).getTime() > new Date(existing.email.date).getTime());
    if (better) {
      byCaller.set(phone, { email, call, calls: existing.calls });
    }
  }

  console.log(`${byCaller.size} מתקשרים ייחודיים (${unparsed} מיילים לא פוענחו)`);

  const stats = { inserted: 0, existsPhone: 0, existsEmail: 0, errors: 0 };
  for (const [phone, { email, call, calls }] of byCaller) {
    const { data: byPhone } = await supabase.from("leads").select("id").eq("phone", phone).limit(1);
    if (byPhone && byPhone.length > 0) {
      stats.existsPhone++;
      continue;
    }
    const { data: byEmailId } = await supabase
      .from("leads").select("id").eq("original_email_id", email.id).limit(1);
    if (byEmailId && byEmailId.length > 0) {
      stats.existsEmail++;
      continue;
    }

    const answered = call.status === "ANSWER";
    const notes = [
      answered
        ? `שיחה נכנסת שנענתה (${call.durationSeconds ?? "?"} שנ')`
        : `שיחה נכנסת שלא נענתה (${call.status ?? "סטטוס לא ידוע"}) — לחזור למועמד`,
      calls > 1 ? `${calls} שיחות סה"כ` : null,
      call.virtualNumber ? `מספר וירטואלי: ${call.virtualNumber}` : null,
      "הושלם רטרואקטיבית ממיילי מסקיו",
    ].filter(Boolean).join(" | ");

    console.log(`  + ${phone} | ${answered ? `נענתה ${call.durationSeconds}s` : call.status} | ${calls} שיחות | ${email.date}`);

    if (!APPLY) continue;
    const { error } = await supabase.from("leads").insert({
      name: "לא ידוע",
      phone,
      email: null,
      location: null,
      experience: null,
      age: null,
      job_title: null,
      source: "טלפון",
      status: LEAD_STATUSES.NEW_LEAD,
      original_email_id: email.id,
      original_email_body: email.body,
      original_email_from: email.from,
      original_email_subject: email.subject,
      email_date:
        email.date && !isNaN(new Date(email.date).getTime())
          ? new Date(email.date).toISOString()
          : null,
      ai_confidence: 1,
      notes,
      assigned_to: null,
    });
    if (error) {
      stats.errors++;
      console.log(`  ✗ שגיאה ב-${phone}: ${error.message}`);
    } else {
      stats.inserted++;
    }
  }

  console.log(
    `סיכום: ${APPLY ? "הוכנסו" : "היו נכנסים"} ${APPLY ? stats.inserted : byCaller.size - stats.existsPhone - stats.existsEmail}, ` +
      `קיימים לפי טלפון: ${stats.existsPhone}, קיימים לפי מייל: ${stats.existsEmail}, שגיאות: ${stats.errors}`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
