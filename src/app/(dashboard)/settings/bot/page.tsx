import { createClient as createServerClient } from "@supabase/supabase-js";
import Link from "next/link";
import { botDailyCapPerNumber, botMode, botRejectEnabled } from "@/lib/botConfig";

export const dynamic = "force-dynamic";

// מסך בקרה לבוט הסינון (שלב 1): מצב, מספרים בסבב, תור הפתיחות,
// וטיוטות מצב הצל לבדיקה. קריאה בלבד — המתגים עצמם ב-env של Vercel.

function admin() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

const MODE_LABELS: Record<string, { label: string; cls: string }> = {
  off: { label: "כבוי", cls: "bg-gray-100 text-gray-700" },
  shadow: { label: "מצב צל — מנסח בלי לשלוח", cls: "bg-amber-100 text-amber-800" },
  live: { label: "פעיל — שולח למועמדים", cls: "bg-green-100 text-green-800" },
};

function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("he-IL", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function BotSettingsPage() {
  const db = admin();
  const mode = botMode();

  const [{ data: accounts }, { data: shadow }, { data: outbox }, pendingRes, sentTodayRes] =
    await Promise.all([
      db
        .from("whatsapp_accounts")
        .select("label, user_email, instance_id, is_active, bot_enabled, last_state, state_checked_at")
        .order("label"),
      db
        .from("bot_shadow_replies")
        .select("id, lead_id, proposed_reply, action, human_reason, screening_score, created_at, leads(name, source)")
        .order("created_at", { ascending: false })
        .limit(50),
      db
        .from("bot_outbox")
        .select("lead_id, status, via_instance, error, created_at, sent_at, leads(name, source)")
        .order("created_at", { ascending: false })
        .limit(20),
      db.from("bot_outbox").select("id", { count: "exact", head: true }).eq("status", "pending"),
      db
        .from("bot_outbox")
        .select("id", { count: "exact", head: true })
        .eq("status", "sent")
        .gte("sent_at", new Date(new Date().setHours(0, 0, 0, 0)).toISOString()),
    ]);

  const modeInfo = MODE_LABELS[mode];
  const sources = (process.env.SCREENING_BOT_SOURCES ?? "").trim() || "— לא הוגדרו —";

  return (
    <div className="p-6 max-w-4xl" dir="rtl">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">בוט הסינון</h1>
      <p className="text-sm text-gray-500 mb-6">
        מסך בקרה — המתגים עצמם מוגדרים ב-Environment Variables של Vercel.
      </p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <div className="bg-white border rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">מצב</p>
          <span className={`inline-block text-sm font-semibold rounded-full px-3 py-1 ${modeInfo.cls}`}>
            {modeInfo.label}
          </span>
        </div>
        <div className="bg-white border rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">מקורות מופעלים</p>
          <p className="text-sm font-medium text-gray-800">{sources}</p>
        </div>
        <div className="bg-white border rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">נשלחו היום / מכסה למספר</p>
          <p className="text-xl font-bold text-gray-900 tabular-nums">
            {sentTodayRes.count ?? 0} <span className="text-sm font-normal text-gray-400">/ {botDailyCapPerNumber()}</span>
          </p>
        </div>
        <div className="bg-white border rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">ממתינים בתור</p>
          <p className="text-xl font-bold text-gray-900 tabular-nums">{pendingRes.count ?? 0}</p>
        </div>
      </div>

      <h2 className="text-lg font-bold text-gray-900 mb-2">המספרים</h2>
      <p className="text-xs text-gray-500 mb-3">
        מספר עם ✓ בסבב שולח הודעות פתיחה קרות. דחיית לידים סופית על ידי הבוט:{" "}
        {botRejectEnabled() ? "מופעלת" : "כבויה — כל דחייה עוברת לרכזת"}.
      </p>
      <div className="bg-white border rounded-xl overflow-hidden mb-8">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-xs text-gray-500">
              <th className="text-right px-4 py-2">מספר</th>
              <th className="text-right px-4 py-2">בסבב הבוט</th>
              <th className="text-right px-4 py-2">מצב GreenAPI</th>
              <th className="text-right px-4 py-2">נבדק</th>
            </tr>
          </thead>
          <tbody>
            {(accounts ?? []).map((a) => (
              <tr key={String(a.instance_id)} className="border-t">
                <td className="px-4 py-2 font-medium">{a.label ?? a.user_email}</td>
                <td className="px-4 py-2">{a.bot_enabled ? "✓ כן" : "—"}</td>
                <td className="px-4 py-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      a.last_state === "authorized"
                        ? "bg-green-50 text-green-700"
                        : a.last_state
                          ? "bg-red-50 text-red-700"
                          : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {a.last_state ?? "טרם נבדק"}
                  </span>
                </td>
                <td className="px-4 py-2 text-gray-500 tabular-nums">{fmtTime(a.state_checked_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="text-lg font-bold text-gray-900 mb-2">
        טיוטות מצב הצל <span className="text-sm font-normal text-gray-400">(50 אחרונות)</span>
      </h2>
      <p className="text-xs text-gray-500 mb-3">
        מה הבוט היה שולח לכל ליד חדש — לקריאה ולכיול לפני ההדלקה. שום דבר מכאן לא נשלח.
      </p>
      {(shadow ?? []).length === 0 ? (
        <p className="text-sm text-gray-400 bg-gray-50 border rounded-xl px-4 py-6 text-center mb-8">
          אין עדיין טיוטות — יופיעו כאן כשהמצב הוא shadow ולידים חדשים נכנסים.
        </p>
      ) : (
        <div className="space-y-2 mb-8">
          {(shadow ?? []).map((s) => {
            const lead = (Array.isArray(s.leads) ? s.leads[0] : s.leads) as
              | { name: string | null; source: string | null }
              | null;
            return (
              <div key={String(s.id)} className="bg-white border rounded-xl p-4">
                <div className="flex flex-wrap items-center gap-2 mb-2 text-xs">
                  <Link href={`/leads/${s.lead_id}`} className="font-semibold text-cyan-700 hover:underline">
                    {lead?.name ?? "ליד"}
                  </Link>
                  <span className="text-gray-400">{lead?.source ?? ""}</span>
                  <span className="text-gray-400 tabular-nums">{fmtTime(s.created_at as string)}</span>
                  <span className="ms-auto rounded-full bg-gray-100 px-2 py-0.5 text-gray-600">
                    {String(s.action ?? "")}{s.screening_score != null ? ` · ${s.screening_score}` : ""}
                  </span>
                </div>
                <p className="text-sm text-gray-800 whitespace-pre-wrap bg-green-50 border border-green-100 rounded-lg px-3 py-2">
                  {String(s.proposed_reply)}
                </p>
              </div>
            );
          })}
        </div>
      )}

      <h2 className="text-lg font-bold text-gray-900 mb-2">
        תור הפתיחות <span className="text-sm font-normal text-gray-400">(20 אחרונים)</span>
      </h2>
      <div className="bg-white border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-xs text-gray-500">
              <th className="text-right px-4 py-2">ליד</th>
              <th className="text-right px-4 py-2">מקור</th>
              <th className="text-right px-4 py-2">סטטוס</th>
              <th className="text-right px-4 py-2">נשלח</th>
            </tr>
          </thead>
          <tbody>
            {(outbox ?? []).map((o) => {
              const lead = (Array.isArray(o.leads) ? o.leads[0] : o.leads) as
                | { name: string | null; source: string | null }
                | null;
              return (
                <tr key={String(o.lead_id)} className="border-t">
                  <td className="px-4 py-2">
                    <Link href={`/leads/${o.lead_id}`} className="text-cyan-700 hover:underline">
                      {lead?.name ?? "ליד"}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-gray-500">{lead?.source ?? "—"}</td>
                  <td className="px-4 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        o.status === "sent"
                          ? "bg-green-50 text-green-700"
                          : o.status === "pending"
                            ? "bg-amber-50 text-amber-700"
                            : "bg-red-50 text-red-700"
                      }`}
                      title={(o.error as string) ?? undefined}
                    >
                      {String(o.status)}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-gray-500 tabular-nums">{fmtTime(o.sent_at as string | null)}</td>
                </tr>
              );
            })}
            {(outbox ?? []).length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-gray-400 text-sm">
                  התור ריק — יתמלא כשהמצב live ולידים חדשים נכנסים.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
