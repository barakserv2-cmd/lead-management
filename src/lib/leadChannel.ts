// ============================================================
// ערוץ גיוס של ליד — מאיפה שמע עלינו, איך פנה, ומאיזו מודעה.
//
// 30.09: סער רוצה לדעת איזה ערוץ באמת עובד. השדה "מקור" ערבב שני
// דברים: דרך פנייה ("טלפון", "וואטסאפ") ומוצא ("גוגל ממומן"). שיחה
// ממודעת גוגל נרשמה "טלפון" וטופס מאותה מודעה "גוגל ממומן"; 139 לידים
// ב-60 יום היו "אחר" בלי שום פרט; דפי נחיתה נשאו את קוד המודעה בכתובת
// ואף אחד לא קרא אותו.
//
// שלושה שדות נפרדים:
//   channel  — איפה שמע עלינו (גוגל ממומן, פייסבוק אורגני, AllJobs...)
//   method   — איך יצר קשר (טופס, שיחה, וואטסאפ, צ'אט...)
//   campaign — איזו מודעה/קבוצה/דף, כשידוע
//
// הפונקציה טהורה — אותם כללים משמשים את המילוי השוטף ואת המילוי לאחור.
// ============================================================

export const CHANNELS = [
  "גוגל ממומן",
  "גוגל אורגני",
  "פייסבוק ממומן",
  "פייסבוק אורגני",
  "קבוצות פייסבוק",
  "אינסטגרם",
  "טיקטוק ממומן",
  "טיקטוק אורגני",
  "צ'אט GPT",
  "AllJobs",
  'פק"ש',
  "קבוצות וסטטוס וואטסאפ",
  "טלגרם",
  "מדבקות",
  "חבר מביא חבר",
  "אתר (אורגני/ישיר)",
  "מאגר (פנייה יזומה)",
  "לא ידוע",
] as const;
export type Channel = (typeof CHANNELS)[number];

/** מה רכזת יכולה לבחור ביד — בלי "אתר" ו"מאגר", שנקבעים רק אוטומטית. */
export const RECRUITER_CHANNELS: Channel[] = [
  "גוגל ממומן", "גוגל אורגני", "פייסבוק ממומן", "פייסבוק אורגני", "קבוצות פייסבוק",
  "אינסטגרם", "טיקטוק ממומן", "טיקטוק אורגני", "צ'אט GPT", "AllJobs", 'פק"ש',
  "קבוצות וסטטוס וואטסאפ", "טלגרם", "מדבקות", "חבר מביא חבר", "לא ידוע",
];

export const METHODS = ["טופס", "שיחה", "וואטסאפ", "צ'אט", "מועמדות בלוח", "ידני"] as const;
export type Method = (typeof METHODS)[number];

/** מספרי מסקיו → ערוץ. מקור: רשימת המספרים בחשבון מסקיו (צילום של סער, 30.09). */
export const MASKYOO_CHANNEL: Record<string, Channel> = {
  "0738021099": "גוגל ממומן",
  "0738020145": "גוגל אורגני",
  "0738022755": "פייסבוק ממומן",
  "0554328284": "פייסבוק אורגני",
  "0554328181": "טיקטוק ממומן",
  "0554329958": "טיקטוק אורגני",
  "0554327673": "אינסטגרם",
  "0554329883": "קבוצות וסטטוס וואטסאפ",
  "0554327030": "טלגרם",
  "0738023002": "מדבקות",
};

export interface LeadForChannel {
  source?: string | null;
  source_number?: string | null;
  original_email_subject?: string | null;
  original_email_body?: string | null;
  /** נוצר ביד (בלי מייל מקור) */
  manual?: boolean;
}

export interface ChannelResult {
  channel: Channel;
  method: Method;
  campaign: string | null;
}

const digits = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "").replace(/^972/, "0");

/** מחלץ פרמטרי מודעה — גם "utm_source: google" (שדות אלמנטור) וגם "?utm_source=google" (כתובת הדף). */
export function readAdParams(body: string): {
  source: string | null; medium: string | null; campaign: string | null; google: boolean; facebook: boolean;
} {
  const field = (name: string): string | null => {
    const m =
      body.match(new RegExp(`(?:cf-)?${name}:[ \\t]*([^\\s&]+)`, "i")) ??
      body.match(new RegExp(`[?&]${name}=([^&\\s#"']+)`, "i"));
    if (!m) return null;
    const v = m[1];
    if (/^(cf-)?utm_/i.test(v)) return null; // "utm_source: utm_medium:" = ריק
    try { return decodeURIComponent(v.replace(/\+/g, " ")); } catch { return v; }
  };
  return {
    source: field("utm_source"),
    medium: field("utm_medium"),
    campaign: field("utm_campaign"),
    google: /[?&](gclid|gbraid|wbraid)=/i.test(body),
    facebook: /[?&]fbclid=/i.test(body),
  };
}

function channelFromAds(ad: ReturnType<typeof readAdParams>): Channel | null {
  const src = (ad.source ?? "").toLowerCase();
  const paid = /cpc|ppc|paid|ads?$/i.test(ad.medium ?? "");
  if (src.includes("chatgpt")) return "צ'אט GPT";
  if (src === "google" || src.includes("google") || src === "youtube") return paid || ad.google ? "גוגל ממומן" : "גוגל אורגני";
  if (/^(fb|facebook|meta)$/.test(src)) return paid ? "פייסבוק ממומן" : "פייסבוק אורגני";
  if (/^(ig|instagram)$/.test(src)) return "אינסטגרם";
  if (src.includes("tiktok")) return paid ? "טיקטוק ממומן" : "טיקטוק אורגני";
  if (ad.google) return "גוגל ממומן"; // מזהה לחיצה של גוגל בלי utm
  if (ad.facebook) return "פייסבוק אורגני"; // fbclid מגיע גם מפוסט רגיל
  return null;
}

function methodFor(source: string, manual: boolean, fromEmail: boolean): Method {
  if (/טלפון/.test(source)) return "שיחה";
  if (/וואטסאפ/.test(source)) return "וואטסאפ";
  if (/צ'?אט/.test(source)) return "צ'אט";
  if (/alljobs|פק"ש/i.test(source)) return "מועמדות בלוח";
  if (fromEmail) return "טופס";
  return manual ? "ידני" : "טופס";
}

export function classifyLead(lead: LeadForChannel): ChannelResult {
  const source = (lead.source ?? "").trim();
  const subject = lead.original_email_subject ?? "";
  const body = lead.original_email_body ?? "";
  const fromEmail = !!(subject || body);
  const method = methodFor(source, !!lead.manual, fromEmail);

  // 1. קוד מודעה בגוף המייל (טפסי האתר ודפי הנחיתה)
  const ad = readAdParams(body);
  const byAd = channelFromAds(ad);
  if (byAd) return { channel: byAd, method, campaign: ad.campaign };

  // 2–3. מקור מפורש (מודעת פייסבוק, לוחות, קבוצות)
  const fbGroup = source.match(/^פייסבוק אורגני - (.+)$/);
  if (fbGroup) return { channel: "קבוצות פייסבוק", method: "וואטסאפ", campaign: fbGroup[1].trim() };
  const fbAd = source.match(/^פייסבוק - (.+)$/);
  if (fbAd) return { channel: "פייסבוק ממומן", method: "טופס", campaign: fbAd[1].trim() };
  if (source === "פייסבוק") return { channel: "פייסבוק ממומן", method, campaign: null };
  if (source === "אינסטגרם") return { channel: "אינסטגרם", method, campaign: null };
  if (source === "טיקטוק") return { channel: "טיקטוק ממומן", method, campaign: null };
  if (source === "גוגל ממומן") return { channel: "גוגל ממומן", method, campaign: ad.campaign };
  if (/^alljobs$/i.test(source)) return { channel: "AllJobs", method: "מועמדות בלוח", campaign: null };
  if (source === 'פק"ש') return { channel: 'פק"ש', method: "מועמדות בלוח", campaign: null };
  if (/^החייאה|^מאגר/.test(source)) return { channel: "מאגר (פנייה יזומה)", method, campaign: source };

  // 4. מספר מסקיו — כשהמקור עצמו כללי ("טלפון", "אחר", "וואטסאפ", ידני).
  //    ליד שהגיע ממודעת פייסבוק ואחר כך התקשר נשאר פייסבוק: הפנייה
  //    הראשונה היא זו שהביאה אותו (source_number נרשם רק בשיחה הראשונה).
  const num = digits(lead.source_number);
  if (num && MASKYOO_CHANNEL[num]) {
    return { channel: MASKYOO_CHANNEL[num], method: source === "וואטסאפ" ? "וואטסאפ" : "שיחה", campaign: null };
  }

  // דף נחיתה: שם הדף הוא הקמפיין; בלי קוד מודעה המוצא לא ידוע
  const lp =
    subject.match(/\[New Lead\] Page:\s*'?(.+?)'?\s*$/)?.[1] ??
    subject.match(/ליד חדש בדף נחיתה\s*-?\s*(.+)$/)?.[1] ??
    null;
  if (source === "דף נחיתה" || lp) {
    return { channel: "לא ידוע", method: "טופס", campaign: lp?.trim() ?? null };
  }

  // טופס/צ'אט באתר בלי קוד מודעה = חיפוש רגיל או כניסה ישירה לאתר
  if (/^אתר\b|^אתר -|צ'?אט באתר/.test(source)) {
    return { channel: "אתר (אורגני/ישיר)", method, campaign: null };
  }

  return { channel: "לא ידוע", method, campaign: null };
}
