import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { MyReminders } from "../today/my-reminders";
import { LeadStatus, STATUS_LABELS, type LeadStatusValue } from "@/lib/stateMachine";

// "היום שלי" — רשימת עבודה אחת לרכזת.
//
// עד היום, כדי לדעת מה מוטל עליה, רכזת הייתה צריכה לפתוח חמישה מסכים: תור
// הלידים, ראיון טלפון, אסקלציות, לוח הראיונות, והתזכורות ב"לידים של היום".
// אף אחד מהם לא מציג את השאר, ולכן העבודה הרגישה מפוזרת גם כשהיא לא הייתה
// גדולה. הדף הזה מאחד את החמישה שדורשים פעולה היום, בסדר הדחיפות שלהם.

const GUBGET_EMAIL = "gubget@eilatjobs.com";

/** סטטוסים שבהם המועמד עדיין בטיפול ולכן שתיקה עליו היא בעיה. */
const OPEN_STATUSES: string[] = [
  LeadStatus.NEW_LEAD,
  LeadStatus.CONTACTED,
  LeadStatus.SCREENING_IN_PROGRESS,
  LeadStatus.FIT_FOR_INTERVIEW,
  LeadStatus.INTERVIEW_BOOKED,
];

/** אחרי כמה ימי שתיקה מועמד פתוח נחשב נשכח. */
const STALE_DAYS = 3;

/**
 * ראיון שעדיין דורש משהו מהרכזת. מי שכבר בוטל או לא הגיע — לא צריך להופיע
 * ברשימת היום, בדיוק כמו בלוח הראיונות שמנקה את עצמו.
 */
const LIVE_INTERVIEW_STATUSES: string[] = [
  LeadStatus.INTERVIEW_BOOKED,
  LeadStatus.ARRIVED,
  LeadStatus.POSTPONED_ARRIVAL,
];

/** התאריך של היום בשעון ישראל, כ-YYYY-MM-DD. */
function israelToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date());
}

// interview_date נשמר כשעון קיר ישראלי עם תווית UTC, ולכן גבולות היום
// נבנים עם Z ולא עם +03:00. ראה project_interview_date_wall_clock.
function interviewTimeLabel(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

function waHref(phone: string): string {
  const d = phone.replace(/\D/g, "");
  return `https://wa.me/${d.startsWith("0") ? "972" + d.slice(1) : d}`;
}

function statusLabel(s: string): string {
  return STATUS_LABELS[s as LeadStatusValue] ?? s;
}

const INTERVIEW_TYPE_LABELS: Record<string, string> = {
  phone: "טלפון",
  in_person: "פרונטלי",
  video: "וידאו",
};

/** שורת מועמד אחידה: שם, סטטוס, וקיצורי דרך להתקשר. */
function LeadRow({
  id,
  name,
  phone,
  meta,
  tone = "slate",
}: {
  id: string;
  name: string | null;
  phone: string | null;
  meta: React.ReactNode;
  tone?: "slate" | "orange" | "purple" | "amber";
}) {
  const hover = {
    slate: "hover:bg-slate-50",
    orange: "hover:bg-orange-100/40",
    purple: "hover:bg-purple-100/40",
    amber: "hover:bg-amber-100/40",
  }[tone];

  return (
    <li className={`flex items-center gap-3 px-4 py-2.5 ${hover}`}>
      <div className="min-w-0 flex-1">
        <Link
          href={`/leads/${id}`}
          className="font-semibold text-slate-900 hover:text-cyan-700 hover:underline"
        >
          {name || "מועמד ללא שם"}
        </Link>
        <div className="text-xs text-slate-600 truncate">{meta}</div>
      </div>
      {phone && (
        <div className="shrink-0 flex items-center gap-2 tabular-nums" dir="ltr">
          <a href={`tel:${phone}`} className="text-sm font-medium text-slate-700 hover:text-cyan-700">
            {phone}
          </a>
          <a
            href={waHref(phone)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-emerald-600 hover:text-emerald-800 text-xs font-semibold"
          >
            WA
          </a>
        </div>
      )}
    </li>
  );
}

function Block({
  title,
  count,
  hint,
  border,
  head,
  children,
}: {
  title: string;
  count: number;
  hint?: string;
  border: string;
  head: string;
  children: React.ReactNode;
}) {
  if (count === 0) return null;
  return (
    <section className={`rounded-xl border ${border} overflow-hidden bg-white`}>
      <div className={`flex items-center justify-between px-4 py-2.5 border-b ${border} ${head}`}>
        <h2 className="font-semibold text-sm">
          {title} ({count})
        </h2>
        {hint && <span className="text-xs opacity-70">{hint}</span>}
      </div>
      <ul className="divide-y divide-slate-100">{children}</ul>
    </section>
  );
}

export default async function MyDayPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const email = user?.email ?? "";

  const today = israelToday();

  const [escRes, ivRes, pastIvRes, openRes] = await Promise.all([
    // אסקלציות שממתינות לי: מה שגובגט העביר ועדיין לא נלקח, או מה שכבר עליי
    supabase
      .from("leads")
      .select("id, name, phone, human_attention_reason, human_attention_raised_at, handled_by")
      .eq("needs_human_attention", true)
      .order("human_attention_raised_at", { ascending: false })
      .limit(200),
    // ראיונות היום — גבולות היום ב-Z, כי interview_date הוא שעון ישראל בתווית UTC
    supabase
      .from("leads")
      .select("id, name, phone, status, interview_date, interview_type")
      .ilike("handled_by", email)
      .gte("interview_date", `${today}T00:00:00Z`)
      .lte("interview_date", `${today}T23:59:59Z`)
      .order("interview_date", { ascending: true })
      .limit(100),
    // ראיונות שהתקיימו ואיש לא רשם תוצאה. 34 כאלה נמצאו במערכת כשהמסך הזה
    // נבנה, אחד מהם מחודש מרץ — הם היו בלתי נראים כי שום דף לא חיפש אותם.
    supabase
      .from("leads")
      .select("id, name, phone, sub_status, interview_date")
      .ilike("handled_by", email)
      .eq("status", LeadStatus.INTERVIEW_BOOKED)
      .lt("interview_date", `${today}T00:00:00Z`)
      .order("interview_date", { ascending: true })
      .limit(200),
    // הפתוחים שלי — הגיל מחושב כאן ולא בשאילתה, כי הוא נשען על שלוש עמודות
    supabase
      .from("leads")
      .select("id, name, phone, status, sub_status, last_contact_at, handled_at, created_at")
      .ilike("handled_by", email)
      .in("status", OPEN_STATUSES)
      .limit(500),
  ]);

  const escalations = (escRes.data ?? []).filter((l) => {
    const owner = (l.handled_by as string | null)?.trim().toLowerCase() ?? "";
    return !owner || owner === GUBGET_EMAIL || owner === email.toLowerCase();
  });

  const interviews = (ivRes.data ?? []).filter((l) =>
    LIVE_INTERVIEW_STATUSES.includes(l.status as string)
  );

  const pastInterviews = pastIvRes.data ?? [];
  const pastIds = new Set(pastInterviews.map((l) => l.id as string));

  const stale = (openRes.data ?? [])
    .map((l) => ({
      ...l,
      lastTouch: (l.last_contact_at ?? l.handled_at ?? l.created_at) as string,
    }))
    // מי שכבר מופיע ב"ראיונות שעברו" לא חוזר כאן — אותה משימה, פעם אחת
    .filter((l) => !pastIds.has(l.id as string))
    .filter((l) => daysSince(l.lastTouch) >= STALE_DAYS)
    .sort((a, b) => new Date(a.lastTouch).getTime() - new Date(b.lastTouch).getTime());

  const openCount = (openRes.data ?? []).length;
  const actionable =
    escalations.length + interviews.length + pastInterviews.length + stale.length;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">היום שלי</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          כל מה שדורש ממך פעולה היום, במקום אחד · {openCount} מועמדים פתוחים באחריותך
        </p>
      </div>

      <div className="flex flex-col gap-4 max-w-4xl">
        <Block
          title="🟠 גובגט מחכה לך"
          count={escalations.length}
          hint="גובגט מוקפא עד שתחליטי"
          border="border-orange-200"
          head="bg-orange-50 text-orange-900"
        >
          {escalations.map((l) => (
            <LeadRow
              key={l.id}
              id={l.id as string}
              name={l.name as string | null}
              phone={l.phone as string | null}
              tone="orange"
              meta={
                <>
                  {(l.human_attention_reason as string | null) ?? "השיחה הועברה למגייס/ת"}
                  {l.human_attention_raised_at && (
                    <span className="text-slate-400">
                      {" · "}
                      {daysSince(l.human_attention_raised_at as string) === 0
                        ? "היום"
                        : `לפני ${daysSince(l.human_attention_raised_at as string)} ימים`}
                    </span>
                  )}
                </>
              }
            />
          ))}
        </Block>

        <Block
          title="📅 ראיונות היום"
          count={interviews.length}
          hint="לאשר טלפונית מי מגיע"
          border="border-purple-200"
          head="bg-purple-50 text-purple-900"
        >
          {interviews.map((l) => (
            <LeadRow
              key={l.id}
              id={l.id as string}
              name={l.name as string | null}
              phone={l.phone as string | null}
              tone="purple"
              meta={
                <>
                  <span className="font-semibold text-purple-800">
                    {interviewTimeLabel(l.interview_date as string)}
                  </span>
                  {" · "}
                  {INTERVIEW_TYPE_LABELS[(l.interview_type as string) ?? ""] ?? "ראיון"}
                  {" · "}
                  {statusLabel(l.status as string)}
                </>
              }
            />
          ))}
        </Block>

        <Block
          title="❗ ראיונות שעברו בלי תוצאה"
          count={pastInterviews.length}
          hint="הראיון היה — מה קרה בו?"
          border="border-red-200"
          head="bg-red-50 text-red-900"
        >
          {pastInterviews.map((l) => {
            const days = daysSince(l.interview_date as string);
            return (
              <LeadRow
                key={l.id}
                id={l.id as string}
                name={l.name as string | null}
                phone={l.phone as string | null}
                meta={
                  <>
                    ראיון ב-{String(l.interview_date).slice(8, 10)}/
                    {String(l.interview_date).slice(5, 7)}
                    {l.sub_status ? ` · ${l.sub_status}` : ""}
                    {" · "}
                    <span className={days >= 14 ? "text-red-600 font-semibold" : ""}>
                      עברו {days} ימים והסטטוס עדיין &quot;ראיון נקבע&quot;
                    </span>
                  </>
                }
              />
            );
          })}
        </Block>

        {/* התזכורות מביאות את עצמן — אותה רשימה שכבר קיימת ב"לידים של היום" */}
        <MyReminders />

        <Block
          title="⏳ לא נגעת בהם"
          count={stale.length}
          hint={`${STALE_DAYS} ימים ומעלה — להמשיך או לסגור`}
          border="border-slate-200"
          head="bg-slate-50 text-slate-800"
        >
          {stale.map((l) => (
            <LeadRow
              key={l.id}
              id={l.id as string}
              name={l.name as string | null}
              phone={l.phone as string | null}
              meta={
                <>
                  {statusLabel(l.status as string)}
                  {l.sub_status ? ` · ${l.sub_status}` : ""}
                  {" · "}
                  <span className={daysSince(l.lastTouch) >= 7 ? "text-red-600 font-semibold" : ""}>
                    {daysSince(l.lastTouch)} ימים
                  </span>
                </>
              }
            />
          ))}
        </Block>

        {actionable === 0 && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-8 text-center">
            <p className="text-emerald-900 font-semibold">אין כלום שממתין לך 🎉</p>
            <p className="text-sm text-emerald-800/80 mt-1">
              אין אסקלציות, אין ראיונות היום, ואף מועמד פתוח לא נשכח.
            </p>
            <Link
              href="/leads"
              className="inline-block mt-3 text-sm font-semibold text-cyan-700 hover:underline"
            >
              לתור הלידים החדשים ←
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
