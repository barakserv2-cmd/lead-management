import { redirect } from "next/navigation";
import { getAuthedUser, getSupabaseAdmin } from "@/lib/api-auth";

// Channel performance tracker (Stage A): per source — volume, response speed,
// and conversion — so we can watch גובגט's instant-response lift dead channels
// before deciding where to spend. Median response = lead created → first
// outbound (assistant=גובגט or recruiter).

const INTERVIEW_PLUS = ["INTERVIEW_BOOKED", "ARRIVED", "HIRED", "STARTED", "NO_SHOW", "NOT_ACCEPTED", "EMPLOYMENT_ENDED"];
const HIRED = ["HIRED", "STARTED", "EMPLOYMENT_ENDED"];
const DAYS = 30;

/**
 * איזה מספר ווירטואלי יושב באיזה ערוץ (מסר סער, 27.09).
 *
 * בלי המיפוי הזה כל שיחה נרשמת פשוט כ"טלפון", וגוגל נמדדת רק לפי מי
 * שטרח למלא טופס — הקבוצה הפחות מחויבת. מי שחיפש בגוגל והתקשר
 * נספר כאילו הגיע מעצמו.
 *
 * אם מספר מועבר לערוץ אחר — יש לעדכן כאן, אחרת הדוח משקר.
 */
const NUMBER_CHANNEL: Record<string, string> = {
  "0738021099": "אתר — שיחה",
  "0738020145": "גוגל ממומן — שיחה",
  // הקו הישיר של תמי. סער אמר שבוטל — אבל שיחות ממשיכות להגיע
  // אליו (האחרונה 26.09), ועל אף אחת מהעשר לא ענו. נשאר במיפוי כדי
  // שהדוח יקרא אותו בשמו ולא יציג אותו כ"טלפון" סתם.
  "0554328284": "קו ישיר (תמי) — בוטל",
};
// חלון שני, קצר — חציון של 30 יום גורר איתו כל השבוע שגובגט היה מנותק,
// ואז המסך מראה "שעתיים" גם אחרי שהבעיה תוקנה.
const WEEK = 7;

export default async function ChannelsPage() {
  const user = await getAuthedUser();
  if (!user) redirect("/login");
  const db = getSupabaseAdmin();
  const since = new Date(Date.now() - DAYS * 86400_000).toISOString();

  // paginate leads
  const leads: { id: string; source: string | null; status: string; created_at: string; source_number: string | null }[] = [];
  for (let f = 0; ; f += 1000) {
    const { data } = await db.from("leads").select("id, source, status, created_at, source_number").gte("created_at", since).range(f, f + 999);
    if (data) leads.push(...data);
    if (!data || data.length < 1000) break;
  }
  const ids = leads.map((l) => l.id);

  // first outbound time per lead
  const firstOut = new Map<string, number>();
  for (let i = 0; i < ids.length; i += 300) {
    const { data } = await db.from("messages").select("lead_id, created_at").in("lead_id", ids.slice(i, i + 300)).in("role", ["assistant", "recruiter"]).order("created_at", { ascending: true });
    for (const m of data ?? []) if (!firstOut.has(m.lead_id)) firstOut.set(m.lead_id, new Date(m.created_at).getTime());
  }

  const weekAgo = Date.now() - WEEK * 86400_000;
  type Row = { source: string; leads: number; interview: number; hired: number; resp: number[]; resp7: number[]; noReply: number };
  const map = new Map<string, Row>();
  for (const l of leads) {
    // מספר מעקב גובר על תיוג המקור — הוא אומר מאיפה הגיעו, ולא איך פנו
    const s = (l.source_number ? NUMBER_CHANNEL[l.source_number] : null) ?? (l.source || "לא ידוע");
    if (!map.has(s)) map.set(s, { source: s, leads: 0, interview: 0, hired: 0, resp: [], resp7: [], noReply: 0 });
    const row = map.get(s)!;
    row.leads++;
    if (INTERVIEW_PLUS.includes(l.status)) row.interview++;
    if (HIRED.includes(l.status)) row.hired++;
    const o = firstOut.get(l.id);
    const born = new Date(l.created_at).getTime();
    // ליד שאף הודעה לא יצאה אליו אינו "אינסוף" בחציון — הוא פשוט
    // יוצא ממנו, ולכן הוא נספר בנפרד. בלעדיו עמודת התגובה מחמיאה.
    if (o === undefined) { row.noReply++; }
    else { const d = (o - born) / 60000; if (d >= 0) { row.resp.push(d); if (born >= weekAgo) row.resp7.push(d); } }
  }
  const rows = [...map.values()].sort((a, b) => b.leads - a.leads);
  const med = (a: number[]) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
  const totals = rows.reduce((t, r) => ({ leads: t.leads + r.leads, interview: t.interview + r.interview, hired: t.hired + r.hired }), { leads: 0, interview: 0, hired: 0 });

  const convClass = (p: number) => (p >= 8 ? "text-green-600" : p >= 4 ? "text-amber-600" : "text-red-500");
  // דקות / שעות / ימים במלים מלאות — "ש'" נקרא גם כשניות וגם כשעות.
  const respStr = (m: number | null) =>
    m === null ? "—"
      : m < 60 ? `${m.toFixed(0)} דקות`
      : m < 1440 ? `${(m / 60).toFixed(1)} שעות`
      : `${(m / 1440).toFixed(1)} ימים`;

  return (
    <div dir="rtl" className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900 tracking-tight">ביצועי ערוצים · שלב א׳</h1>
        <p className="text-sm text-gray-500 mt-1">
          30 יום · {totals.leads} לידים · {totals.hired} גיוסים ({totals.leads ? Math.round((totals.hired / totals.leads) * 100) : 0}%)
          · מטרה: לראות את זמן התגובה יורד וההמרה עולה ככל שגובגט עונה ראשונה
        </p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="w-full text-sm min-w-[560px]">
          <thead>
            <tr className="bg-sky-50 text-sky-800 text-xs text-right">
              <th className="px-4 py-3 font-semibold">מקור</th>
              <th className="px-4 py-3 font-semibold">לידים</th>
              <th className="px-4 py-3 font-semibold">תגובה חציונית · 30 יום</th>
              <th className="px-4 py-3 font-semibold">· 7 ימים</th>
              <th className="px-4 py-3 font-semibold">ללא מענה</th>
              <th className="px-4 py-3 font-semibold">הגיעו לראיון</th>
              <th className="px-4 py-3 font-semibold">גיוסים</th>
              <th className="px-4 py-3 font-semibold">המרה</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const conv = r.leads ? Math.round((r.hired / r.leads) * 100) : 0;
              const m = med(r.resp);
              const m7 = med(r.resp7);
              return (
                <tr key={r.source} className="border-t border-gray-100">
                  <td className="px-4 py-2.5 font-medium text-gray-900">{r.source}</td>
                  <td className="px-4 py-2.5 tabular-nums">{r.leads}</td>
                  <td className={`px-4 py-2.5 tabular-nums ${m !== null && m < 5 ? "text-green-600 font-semibold" : "text-gray-600"}`}>{respStr(m)}</td>
                  <td className={`px-4 py-2.5 tabular-nums ${m7 !== null && m7 < 5 ? "text-green-600 font-semibold" : "text-gray-600"}`}>{respStr(m7)}</td>
                  <td className={`px-4 py-2.5 tabular-nums ${r.noReply ? "text-red-500" : "text-gray-400"}`}>{r.noReply || "—"}</td>
                  <td className="px-4 py-2.5 tabular-nums text-gray-600">{r.interview}</td>
                  <td className="px-4 py-2.5 tabular-nums">{r.hired}</td>
                  <td className={`px-4 py-2.5 tabular-nums font-bold ${convClass(conv)}`}>{conv}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="bg-sky-50 border border-sky-200 rounded-xl p-4 text-sm text-sky-900">
        <b>איך לקרוא:</b> עמודת <b>7 ימים</b> היא המצב עכשיו; עמודת <b>30 יום</b> גוררת איתה גם ימים שבהם גובגט היה מנותק,
        אז הפער ביניהן הוא השיפור. אם ערוץ עם המרה נמוכה (אדום) מתחיל להראות תגובה מהירה — עקוב אחרי ההמרה שלו
        בשבועיים הקרובים. אם היא עולה → הערוץ לא היה רע, רק איטי. אם נשארת נמוכה גם עם מענה מהיר → זה ערוץ לחתוך (שלב ג').
        <br />
        <b>ללא מענה</b> = לידים שלא יצאה אליהם אף הודעה. הם אינם נכנסים לחציון — ולכן עמודה זו היא הסייג שלו.
        שיחת טלפון של רכזת אינה נרשמת כאן, אז חלק מהלידים האלה כן טופלו — רק לא בכתב.
      </div>

      <p className="text-xs text-gray-400 text-center pt-2 border-t border-gray-100">
        מתעדכן בכל טעינה · חלון 30 יום · המרה = גיוסים / לידים
      </p>
    </div>
  );
}
