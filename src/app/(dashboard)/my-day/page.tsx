import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/api-auth";
import { FOLLOW_UP } from "@/lib/constants";
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

/** אחרי כמה שעות בלי אף הודעה יוצאת שיחה של גובגט נחשבת שהשתתקה. */
const QUIET_HOURS = 48;

/** השלבים שבהם גובגט מנהל את השיחה לבד, לפני שמישהו קבע ראיון. */
const QUIET_STATUSES: string[] = [
  LeadStatus.CONTACTED,
  LeadStatus.SCREENING_IN_PROGRESS,
  LeadStatus.FIT_FOR_INTERVIEW,
];

/** ליד סגור לא צריך טיפול גם אם נשאר עליו דגל ישן. */
const CLOSED_STATUSES: string[] = [
  LeadStatus.REJECTED,
  LeadStatus.NOT_SUITABLE,
  LeadStatus.LOST_CONTACT,
  LeadStatus.INVALID_PHONE,
  LeadStatus.NOT_ACCEPTED,
  LeadStatus.NO_SHOW,
  LeadStatus.CANCELLED_ARRIVAL,
  LeadStatus.EMPLOYMENT_ENDED,
];

/** ליד בלי רכזת אחראית — נקבע ע"י גובגט או ע"י המועמד עצמו. */
function isUnowned(handledBy: unknown): boolean {
  const owner = typeof handledBy === "string" ? handledBy.trim().toLowerCase() : "";
  return !owner || owner === GUBGET_EMAIL;
}

function UnownedTag() {
  return (
    <span className="ms-1 inline-block rounded bg-gray-100 px-1.5 text-[11px] font-medium text-gray-600">
      ללא רכזת
    </span>
  );
}

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
    orange: "hover:bg-gray-50",
    purple: "hover:bg-gray-50",
    amber: "hover:bg-gray-50",
  }[tone];

  return (
    <li className={`flex items-center gap-3 px-4 py-2.5 ${hover}`}>
      <div className="min-w-0 flex-1">
        <Link
          href={`/leads/${id}`}
          className="font-medium text-gray-900 hover:text-cyan-700"
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
            className="h-7 px-2 inline-flex items-center rounded-md border border-gray-200 text-emerald-700 hover:bg-emerald-50 text-xs font-medium"
          >
            WhatsApp
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
  // כרטיס ניטרלי; הצבע רק בנקודה ובמונה — כך חמשת הבלוקים נקראים כמערכת
  // אחת, והדחיפות עדיין מזוהה במבט.
  const DOT: Record<string, string> = {
    "border-orange-200": "bg-orange-500",
    "border-purple-200": "bg-purple-500",
    "border-red-200": "bg-red-500",
    "border-amber-200": "bg-amber-500",
    "border-slate-200": "bg-gray-400",
  };
  void head;
  return (
    <section className="rounded-xl border border-gray-200 overflow-hidden bg-white">
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-gray-100">
        <h2 className="flex items-center gap-2 font-semibold text-[13px] text-gray-900">
          <span className={`w-2 h-2 rounded-full ${DOT[border] ?? "bg-gray-400"}`} />
          {title}
          <span className="min-w-5 h-5 px-1.5 inline-flex items-center justify-center rounded-md bg-gray-100 text-gray-600 text-[11px] font-semibold tabular-nums">
            {count}
          </span>
        </h2>
        {hint && <span className="text-xs text-gray-500">{hint}</span>}
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

  // "שלי או של אף אחד": ראיון שגובגט או המועמד עצמו קבעו (קישור תיאום עצמי)
  // נשאר בלי רכזת אחראית — handled_by ריק או של גובגט — ולכן לא הופיע לאף
  // אחד. עכשיו הוא מופיע לכל הרכזות עד שמישהי רושמת תוצאה.
  const mineOrUnowned = `handled_by.ilike.${email},handled_by.is.null,handled_by.eq.${GUBGET_EMAIL}`;
  // eslint-disable-next-line react-hooks/purity -- server component, renders once per request
  const quietCutoffMs = Date.now() - QUIET_HOURS * 3600_000;
  const quietCutoff = new Date(quietCutoffMs).toISOString();

  const [escRes, ivRes, pastIvRes, openRes, remRes, attnRes, quietRes] = await Promise.all([
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
      .select("id, name, phone, status, interview_date, interview_type, handled_by")
      .or(mineOrUnowned)
      .gte("interview_date", `${today}T00:00:00Z`)
      .lte("interview_date", `${today}T23:59:59Z`)
      .order("interview_date", { ascending: true })
      .limit(100),
    // ראיונות שהתקיימו ואיש לא רשם תוצאה. 34 כאלה נמצאו במערכת כשהמסך הזה
    // נבנה, אחד מהם מחודש מרץ — הם היו בלתי נראים כי שום דף לא חיפש אותם.
    supabase
      .from("leads")
      // "דחה הגעה" נשאר בסטטוס הזה גם אחרי המועד החדש — גם הוא ממתין לתוצאה
      .select("id, name, phone, status, sub_status, interview_date, handled_by")
      .or(mineOrUnowned)
      .in("status", [LeadStatus.INTERVIEW_BOOKED, LeadStatus.POSTPONED_ARRIVAL])
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
    // התזכורות הפתוחות שלי — רק כדי לדעת למי כבר יש מועד. reminders נקרא
    // דרך service role, בדיוק כמו ב-/api/reminders.
    getSupabaseAdmin()
      .from("reminders")
      .select("lead_id")
      .eq("recruiter", email)
      .eq("is_completed", false)
      .limit(500),
    // "דורש תשומת לב" — נדלק בהרבה מקומות (מועמד שביטל ראיון שקבע לבד, שאלה
    // בוואטסאפ, מועמד קיים שהגיש שוב, תקופת אחריות שמסתיימת) אבל הוצג רק בתוך
    // כרטיס הליד, כלומר רק למי שכבר פתחה אותו.
    supabase
      .from("leads")
      .select("id, name, phone, status, attention_reason, needs_attention_at, handled_by")
      .eq("needs_attention", true)
      .not("needs_human_attention", "is", true)
      .not("status", "in", `(${CLOSED_STATUSES.join(",")})`)
      .or(mineOrUnowned)
      .order("needs_attention_at", { ascending: true, nullsFirst: false })
      .limit(200),
    // שיחות של גובגט שהשתתקו: ליד בלי רכזת, באמצע התהליך, ששום הודעה לא
    // יצאה אליו כבר QUIET_HOURS שעות. אף בלוק ואף חוק לא תפס אותם עד עכשיו.
    supabase
      .from("leads")
      .select("id, name, phone, status, last_contact_at, created_at")
      .or(`handled_by.is.null,handled_by.eq.${GUBGET_EMAIL}`)
      .in("status", QUIET_STATUSES)
      .not("needs_human_attention", "is", true)
      .or(`last_contact_at.lt.${quietCutoff},last_contact_at.is.null`)
      .order("last_contact_at", { ascending: true, nullsFirst: true })
      .limit(200),
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

  // אותה משימה מוצגת פעם אחת: ראיון שעבר קודם לדגל
  const attention = (attnRes.data ?? []).filter((l) => !pastIds.has(l.id as string));
  const attentionIds = new Set(attention.map((l) => l.id as string));

  const quiet = (quietRes.data ?? [])
    .map((l) => ({ ...l, lastTouch: (l.last_contact_at ?? l.created_at) as string }))
    .filter((l) => !attentionIds.has(l.id as string))
    .filter((l) => new Date(l.lastTouch).getTime() < quietCutoffMs);

  // "מעקב" שנשמר לפני שהמועד הפך לחובה — החלטה שנדחתה ואיש לא קבע מתי לחזור
  const remindedLeadIds = new Set((remRes.data ?? []).map((r) => r.lead_id as string));
  const undatedFollowUps = (openRes.data ?? []).filter(
    (l) => l.sub_status === FOLLOW_UP && !remindedLeadIds.has(l.id as string)
  );
  const undatedIds = new Set(undatedFollowUps.map((l) => l.id as string));

  const stale = (openRes.data ?? [])
    .map((l) => ({
      ...l,
      lastTouch: (l.last_contact_at ?? l.handled_at ?? l.created_at) as string,
    }))
    // מי שכבר מופיע בבלוק אחר לא חוזר כאן — אותה משימה מוצגת פעם אחת
    .filter(
      (l) =>
        !pastIds.has(l.id as string) &&
        !undatedIds.has(l.id as string) &&
        !attentionIds.has(l.id as string)
    )
    .filter((l) => daysSince(l.lastTouch) >= STALE_DAYS)
    .sort((a, b) => new Date(a.lastTouch).getTime() - new Date(b.lastTouch).getTime());

  const openCount = (openRes.data ?? []).length;
  const actionable =
    escalations.length +
    interviews.length +
    pastInterviews.length +
    attention.length +
    quiet.length +
    undatedFollowUps.length +
    stale.length;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900 tracking-tight">היום שלי</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          כל מה שדורש ממך פעולה היום, במקום אחד · {openCount} מועמדים פתוחים באחריותך
        </p>
      </div>

      <div className="flex flex-col gap-4 max-w-4xl">
        <Block
          title="גובגט מחכה לך"
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
          title="ראיונות היום"
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
                  {isUnowned(l.handled_by) && <UnownedTag />}
                </>
              }
            />
          ))}
        </Block>

        <Block
          title="ראיונות שעברו בלי תוצאה"
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
                      עברו {days} ימים והסטטוס עדיין &quot;{statusLabel(l.status as string)}&quot;
                    </span>
                    {isUnowned(l.handled_by) && <UnownedTag />}
                  </>
                }
              />
            );
          })}
        </Block>

        <Block
          title="דורש תשומת לב"
          count={attention.length}
          hint="סימון שהמערכת הדליקה — לבדוק ולנקות בכרטיס"
          border="border-amber-200"
          head="bg-amber-50 text-amber-900"
        >
          {attention.map((l) => (
            <LeadRow
              key={l.id}
              id={l.id as string}
              name={l.name as string | null}
              phone={l.phone as string | null}
              tone="amber"
              meta={
                <>
                  {(l.attention_reason as string | null) ?? "סומן לטיפול"}
                  {" · "}
                  {statusLabel(l.status as string)}
                  {l.needs_attention_at && (
                    <span className="text-slate-400">
                      {" · "}
                      {daysSince(l.needs_attention_at as string) === 0
                        ? "היום"
                        : `לפני ${daysSince(l.needs_attention_at as string)} ימים`}
                    </span>
                  )}
                  {isUnowned(l.handled_by) && <UnownedTag />}
                </>
              }
            />
          ))}
        </Block>

        <Block
          title="שיחות של גובגט שהשתתקו"
          count={quiet.length}
          hint={`בלי רכזת ובלי אף הודעה ${QUIET_HOURS} שעות — לקחת או לסגור`}
          border="border-slate-200"
          head="bg-slate-50 text-slate-800"
        >
          {quiet.map((l) => (
            <LeadRow
              key={l.id}
              id={l.id as string}
              name={l.name as string | null}
              phone={l.phone as string | null}
              meta={
                <>
                  {statusLabel(l.status as string)}
                  {" · "}
                  <span className={daysSince(l.lastTouch) >= 7 ? "text-red-600 font-semibold" : ""}>
                    הודעה אחרונה לפני {daysSince(l.lastTouch)} ימים
                  </span>
                </>
              }
            />
          ))}
        </Block>

        {/* התזכורות מביאות את עצמן — אותה רשימה שכבר קיימת ב"לידים של היום" */}
        <MyReminders />

        <Block
          title="מעקב בלי תאריך"
          count={undatedFollowUps.length}
          hint="לקבוע מתי לחזור, אחרת זה לא משימה"
          border="border-amber-200"
          head="bg-amber-50 text-amber-900"
        >
          {undatedFollowUps.map((l) => (
            <LeadRow
              key={l.id}
              id={l.id as string}
              name={l.name as string | null}
              phone={l.phone as string | null}
              tone="amber"
              meta={
                <>
                  {statusLabel(l.status as string)} · סומן &quot;מעקב&quot; ואין מועד חזרה
                </>
              }
            />
          ))}
        </Block>

        <Block
          title="לא נגעת בהם"
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
          <div className="rounded-xl border border-gray-200 bg-white px-5 py-10 text-center">
            <div className="mx-auto mb-3 w-10 h-10 rounded-full bg-emerald-50 ring-1 ring-emerald-200 text-emerald-600 flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M20 6 9 17l-5-5" /></svg>
            </div>
            <p className="text-gray-900 font-semibold">אין כלום שממתין לך</p>
            <p className="text-sm text-gray-500 mt-1">
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
