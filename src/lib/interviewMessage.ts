// ============================================================
// Interview confirmation — WhatsApp message template
// ============================================================
//
// WhatsApp renders a message as one RTL paragraph. A long Hebrew block with
// inline times, phone numbers and URLs collapses into an unreadable wall in
// which the LTR runs jump around. Two rules keep it legible:
//   1. One idea per line, blank line between sections, *bold* section headers.
//   2. Every LTR run (phone, URL, time-only lines) sits alone on its own line,
//      never embedded mid-sentence. Quantities are spelled out in Hebrew words
//      so no digit run ends up next to a Hebrew prefix ("ל-2-3").

// interview_date נשמר כשעון קיר ישראלי עם תווית UTC (ראו cron/daily) —
// לכן קוראים את שדות ה-UTC כמו שהם, בלי המרת אזור זמן.
const TZ = "UTC";

export const OFFICE_ADDRESS = "שדרות התמרים 39, בניין פירסט קלאב, אילת";
export const OFFICE_PHONE = "08-6488788";
export const FACEBOOK_PAGE = "https://www.facebook.com/barakserv/?referrer=whatsapp";

export interface InterviewMessageInput {
  name: string;
  /** ISO timestamp of the arrival time. */
  interviewDate: string;
  jobTitle?: string | null;
  interviewType?: "phone" | "in_person" | "video" | null;
  /** Recruiter first name, signed at the bottom when known. */
  recruiter?: string | null;
}

function ilDay(iso: string): string {
  return new Date(iso).toLocaleDateString("he-IL", {
    timeZone: TZ,
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function ilTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("he-IL", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
  });
}

function signature(recruiter?: string | null): string {
  const who = recruiter?.trim();
  if (!who || who.includes("@")) return "מחכה לראות אותך 🙌";
  return `מחכה לראות אותך 🙌\n${who}, ברק שירותים`;
}

export function buildInterviewConfirmation(input: InterviewMessageInput): string {
  const { name, interviewDate, jobTitle, interviewType, recruiter } = input;
  const firstName = (name || "").trim().split(/\s+/)[0] || "";
  const role = jobTitle?.trim();
  const isVideo = interviewType === "video";

  const lines: string[] = [
    firstName ? `היי ${firstName} 😊` : "היי 😊",
    "",
    role
      ? `בהמשך לשיחה שלנו — קבעתי לך ראיון עבודה באילת לתפקיד ${role}, כולל אופציה למגורים 🙌`
      : "בהמשך לשיחה שלנו — קבעתי לך ראיון עבודה באילת, כולל אופציה למגורים 🙌",
    "שמרתי לך מקום אישי, אז חשוב לי שתאשר/י לי הגעה 👇",
    "",
    "*📅 מתי*",
    ilDay(interviewDate),
    `שעת הגעה ${ilTime(interviewDate)}`,
  ];

  if (interviewType === "phone") {
    lines.push(
      "",
      "*📞 איך זה עובד*",
      "הראיון בשיחת טלפון — נתקשר אליך בדיוק בשעה שנקבעה.",
      "כדאי להיות במקום שקט עם קליטה טובה."
    );
  } else if (isVideo) {
    lines.push(
      "",
      "*🎥 איך מתחברים*",
      "הראיון בשיחת וידאו — אשלח לך כאן את הקישור סמוך למועד.",
      "כדאי להתחבר ממקום שקט עם קליטה טובה."
    );
  } else {
    lines.push(
      "",
      "*📍 איפה*",
      OFFICE_ADDRESS,
      "חמש דקות מהתחנה המרכזית",
      "",
      "*🚌 איך מגיעים*",
      "לפני 08:00 — הגעה עצמאית",
      "אחרי 08:00 — יש איסוף מהתחנה המרכזית",
      "אפשר להגיע עד 12:30",
      "",
      "*🎒 מה להביא*",
      "• תעודת זהות + ספח",
      "• משוחררי צבא: תעודת שחרור / פטור / צו גיוס",
      "• מצעים למיטת יחיד, כרית ושמיכה",
      "• נעליים סגורות",
      "• דמי קיום לשלושת הימים הראשונים"
    );
  }

  lines.push(
    "",
    "*❤️ חשוב לדעת*",
    "הראיון לא מחייב — באים להכיר ולבדוק התאמה.",
    "מכיוון ששמרתי לך מקום, אשמח לאישור הגעה כאן בהודעה.",
    "",
    "יש שאלה? אני זמינה כאן 🙏",
    "טלפון המשרד (שלוחה 0):",
    OFFICE_PHONE,
    "",
    // `recruiter` falls back to the raw login email when no display name is on
    // file — never sign a candidate-facing message with that.
    signature(recruiter),
    "",
    "עמוד המשרות שלנו:",
    FACEBOOK_PAGE
  );

  return lines.join("\n");
}

/** wa.me deep link with the confirmation pre-filled. */
export function interviewConfirmationWaLink(
  phone: string,
  input: InterviewMessageInput
): string {
  const digits = phone.replace(/\D/g, "");
  const intl = digits.startsWith("972")
    ? digits
    : digits.startsWith("0")
      ? "972" + digits.slice(1)
      : digits;
  return `https://wa.me/${intl}?text=${encodeURIComponent(buildInterviewConfirmation(input))}`;
}
