import { AutomationClient } from "./automation-client";

// מסך הניהול של מנוע החוקים — "ספר מנוע החוקים", פרק 7.
export default function AutomationPage() {
  return (
    <div className="p-6 max-w-3xl" dir="rtl">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">אוטומציה — מנוע החוקים</h1>
      <p className="text-sm text-gray-500 mb-6">
        כל חוק בנוי מ"מתי? על מי? מה עושים?". המנוע רץ כל 5 דקות, פועל רק
        בשעות 08:00–22:00, לא נוגע במי שביקש הסרה, ולא שולח למועמד יותר
        מהודעה אוטומטית אחת ביום. הדלקה וכיבוי — אדמין בלבד.
      </p>
      <AutomationClient />
    </div>
  );
}
