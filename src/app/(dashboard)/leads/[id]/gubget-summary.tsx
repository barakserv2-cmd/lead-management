import type { Lead } from "@/types/leads";

// כותרת "מה גובגט יודע ומה הלאה" בכרטיס המועמד.
//
// התלונה של הרכזות הייתה שהן לא יודעות איפה גובגט עומד מול מועמד: האם הוא
// מדבר איתו עכשיו, מה הוא כבר בירר, ומה הצעד הבא. עד היום המידע הזה היה
// פזור — דגלים בטבלת leads, הערה ביומן, תאריך ראיון בשדה נפרד. כאן הכל
// בשורה אחת בראש הכרטיס, לפני שצריך לחפש.

export interface GubgetSnapshot {
  /** האם גובגט מעורב בליד הזה בכלל */
  involved: boolean;
  score: number | null;
  /** הפרטים שגובגט אסף — טקסט ההערה האחרונה שלו ביומן */
  learned: string | null;
  learnedAt: string | null;
  interviewAt: string | null;
  interviewType: Lead["interview_type"];
  paused: boolean;
  escalated: boolean;
  escalationReason: string | null;
}

const GUBGET_EMAIL = "gubget@eilatjobs.com";

/** מרכיב את התמונה מתוך שורת הליד + ההערה האחרונה של גובגט ביומן. */
export function buildGubgetSnapshot(
  lead: Lead,
  latestNote: { event_text: string; created_at: string } | null
): GubgetSnapshot {
  // גובגט writes source: "גובגט", which is not in the LEAD_SOURCES union that
  // types the column (that list is the recruiters' manual picker).
  const involved =
    (lead.source as string) === "גובגט" ||
    lead.handled_by === GUBGET_EMAIL ||
    lead.screening_score !== null ||
    latestNote !== null;

  return {
    involved,
    score: lead.screening_score ?? null,
    // ההערה נשמרת עם קידומת "📝 גובגט:" — היא מיותרת כאן, הכותרת כבר אומרת את זה
    learned: latestNote ? latestNote.event_text.replace(/^📝\s*גובגט:\s*/, "").trim() : null,
    learnedAt: latestNote?.created_at ?? null,
    interviewAt: lead.interview_date ?? null,
    interviewType: lead.interview_type ?? null,
    paused: !!lead.bot_paused,
    escalated: !!lead.needs_human_attention,
    escalationReason: lead.human_attention_reason ?? null,
  };
}

// interview_date הוא שעון ישראל שנשמר כאילו הוא UTC — קוראים אותו בשדות UTC
// בלבד, אחרת הוא זז בשלוש שעות. ראה project_interview_date_wall_clock.
function formatInterview(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)} בשעה ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  return (
    d.toLocaleDateString("he-IL", { day: "numeric", month: "short" }) +
    " · " +
    d.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })
  );
}

const INTERVIEW_TYPE_LABELS: Record<string, string> = {
  phone: "ראיון טלפון",
  in_person: "ראיון פרונטלי",
  video: "ראיון וידאו",
};

export function GubgetSummary({ snapshot }: { snapshot: GubgetSnapshot }) {
  if (!snapshot.involved) return null;

  // מצב אחד ברור, לפי סדר קדימות: אסקלציה גוברת על השתקה, השתקה על פעיל.
  const state = snapshot.escalated
    ? {
        badge: "מחכה לך",
        tone: "bg-orange-50 border-orange-200",
        chip: "bg-orange-600 text-white",
        line: snapshot.escalationReason
          ? `גובגט העביר אליך: ${snapshot.escalationReason}`
          : "גובגט העביר את השיחה לרכזת/ת",
        next: "גובגט לא ימשיך לדבר איתו עד שתשחררי אותו בדף האסקלציות.",
      }
    : snapshot.paused
      ? {
          badge: "מושתק",
          tone: "bg-slate-50 border-slate-200",
          chip: "bg-slate-600 text-white",
          line: "רכזת לקחה שליטה — גובגט לא שולח הודעות למועמד הזה.",
          next: "השיחה עליך. גובגט ימשיך רק אם תחזירי אותו.",
        }
      : {
          badge: "פעיל",
          tone: "bg-indigo-50 border-indigo-200",
          chip: "bg-indigo-600 text-white",
          line: "גובגט מנהל את השיחה עם המועמד.",
          next: snapshot.interviewAt
            ? `נקבע ${INTERVIEW_TYPE_LABELS[snapshot.interviewType ?? ""] ?? "ראיון"} · ${formatInterview(snapshot.interviewAt)}`
            : "הצעד הבא: לסיים סינון ולקבוע ראיון.",
        };

  return (
    <div className={`rounded-xl border px-5 py-3.5 ${state.tone}`}>
      <div className="flex items-center gap-2 flex-wrap mb-2">
        <span className="text-sm font-bold text-gray-900">🤖 גובגט</span>
        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${state.chip}`}>
          {state.badge}
        </span>
        {snapshot.score !== null && (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-white border border-gray-200 text-gray-600">
            ציון סינון {snapshot.score}/100
          </span>
        )}
      </div>

      <div className="grid gap-2.5 sm:grid-cols-2">
        <div>
          <p className="text-[11px] font-semibold text-gray-500 mb-0.5">מה גובגט יודע</p>
          <p className="text-xs text-gray-800 leading-relaxed">
            {snapshot.learned || "עדיין לא בירר פרטים על המועמד."}
          </p>
          {snapshot.learnedAt && (
            <p className="text-[10px] text-gray-400 mt-0.5">עודכן {formatWhen(snapshot.learnedAt)}</p>
          )}
        </div>
        <div>
          <p className="text-[11px] font-semibold text-gray-500 mb-0.5">מה הלאה</p>
          <p className="text-xs text-gray-800 leading-relaxed">{state.line}</p>
          <p className="text-xs text-gray-600 leading-relaxed mt-0.5">{state.next}</p>
        </div>
      </div>
    </div>
  );
}
