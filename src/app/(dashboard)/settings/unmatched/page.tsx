import { createClient as createServerClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

// "פניות ללא ליד" — ועדת נפח הלידים 12.09, החלטה 2.
// מי שכתב בוואטסאפ ולא זוהה במערכת היה נעלם בלי זכר; מעכשיו הוא מופיע
// כאן. צפייה בלבד: המערכת לא יוצרת מהם לידים (ההוראה של סער בתוקף) —
// רכזת שמזהה מועמד אמיתי מוסיפה אותו ידנית כרגיל.

function admin() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

interface UnmatchedRow {
  id: string;
  phone: string;
  sender_name: string | null;
  instance_id: string | null;
  last_message: string | null;
  message_count: number;
  is_client_contact: boolean;
  client_name: string | null;
  first_at: string;
  last_at: string;
}

function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("he-IL", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function InboundTable({ rows, labels }: { rows: UnmatchedRow[]; labels: Map<string, string> }) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-gray-400 bg-white border rounded-xl px-4 py-6 text-center mb-8">
        אין פניות כרגע.
      </p>
    );
  }
  return (
    <div className="bg-white border rounded-xl overflow-x-auto mb-8">
      <table className="w-full text-sm min-w-[640px]">
        <thead>
          <tr className="bg-gray-50 text-xs text-gray-500">
            <th className="text-right px-4 py-2">טלפון</th>
            <th className="text-right px-4 py-2">שם בוואטסאפ</th>
            <th className="text-right px-4 py-2">הודעות</th>
            <th className="text-right px-4 py-2">הודעה אחרונה</th>
            <th className="text-right px-4 py-2">למספר של</th>
            <th className="text-right px-4 py-2">אחרונה</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t align-top">
              <td className="px-4 py-2 font-medium tabular-nums whitespace-nowrap">{r.phone}</td>
              <td className="px-4 py-2">
                {r.sender_name ?? "—"}
                {r.is_client_contact && r.client_name && (
                  <span className="block text-xs text-amber-700">לקוח: {r.client_name}</span>
                )}
              </td>
              <td className="px-4 py-2 tabular-nums">{r.message_count}</td>
              <td className="px-4 py-2 text-gray-600 max-w-[280px]">
                <span className="line-clamp-2">{r.last_message ?? "—"}</span>
              </td>
              <td className="px-4 py-2 text-gray-500">
                {labels.get(String(r.instance_id)) ?? r.instance_id ?? "—"}
              </td>
              <td className="px-4 py-2 text-gray-500 tabular-nums whitespace-nowrap">
                {fmtTime(r.last_at)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function UnmatchedInboundPage() {
  const db = admin();
  const [{ data: rows }, { data: accounts }] = await Promise.all([
    db
      .from("unmatched_inbound")
      .select("*")
      .order("last_at", { ascending: false })
      .limit(200),
    db.from("whatsapp_accounts").select("instance_id, label, user_email"),
  ]);

  const labels = new Map<string, string>();
  for (const a of accounts ?? []) {
    labels.set(String(a.instance_id), String(a.label ?? a.user_email ?? a.instance_id));
  }

  const all = (rows ?? []) as UnmatchedRow[];
  const candidates = all.filter((r) => !r.is_client_contact);
  const clientContacts = all.filter((r) => r.is_client_contact);

  return (
    <div className="p-6 max-w-4xl" dir="rtl">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">פניות ללא ליד</h1>
      <p className="text-sm text-gray-500 mb-6">
        הודעות וואטסאפ ממספרים שלא מזוהים במערכת. צפייה בלבד — לא נוצר מהן ליד
        אוטומטית; מי שמזהה כאן מועמד אמיתי מוסיפה אותו ידנית. רשומות נמחקות
        אוטומטית אחרי 90 יום.
      </p>

      <h2 className="text-lg font-bold text-gray-900 mb-2">
        לא מזוהים{" "}
        <span className="text-sm font-normal text-gray-400">({candidates.length})</span>
      </h2>
      <InboundTable rows={candidates} labels={labels} />

      <h2 className="text-lg font-bold text-gray-900 mb-2">
        נציגי לקוחות{" "}
        <span className="text-sm font-normal text-gray-400">({clientContacts.length})</span>
      </h2>
      <p className="text-xs text-gray-500 mb-3">
        מספרים שמופיעים אצל לקוח (ראשי או ברשימת אנשי הקשר) — השיחה איתם נשארת
        בטלפון, הם לא מועמדים.
      </p>
      <InboundTable rows={clientContacts} labels={labels} />
    </div>
  );
}
