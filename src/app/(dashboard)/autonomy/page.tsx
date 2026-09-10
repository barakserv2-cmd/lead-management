import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthedUser, getSupabaseAdmin } from "@/lib/api-auth";

// L4 autonomy tracker — measures how much גובגט handles on its own, so we can
// see when it crosses from L3.5 to proven L4. Unified data lives here in v1:
// role='assistant' = גובגט, role='recruiter' = human.

const GUBGET = "gubget@eilatjobs.com";
const DAYS = 7;

export default async function AutonomyPage() {
  const user = await getAuthedUser();
  if (!user) redirect("/login");
  const db = getSupabaseAdmin();
  const since = new Date(Date.now() - DAYS * 86400_000).toISOString();

  const { data: leads } = await db
    .from("leads")
    .select("id, created_at, handled_by, needs_human_attention")
    .gte("created_at", since)
    .limit(2000);
  const leadList = leads ?? [];
  const ids = leadList.map((l) => l.id);

  // messages for those leads (assistant = גובגט, recruiter = human)
  const msgs: { lead_id: string; role: string; created_at: string }[] = [];
  for (let i = 0; i < ids.length; i += 300) {
    const chunk = ids.slice(i, i + 300);
    const { data } = await db
      .from("messages")
      .select("lead_id, role, created_at")
      .in("lead_id", chunk)
      .in("role", ["assistant", "recruiter"])
      .order("created_at", { ascending: true });
    if (data) msgs.push(...data);
  }
  // Quality was a hardcoded "manual" row that could never turn green, so the
  // page could never show a proven L4. The real signal already exists: the
  // reports recruiters file on /feedback against the machine. An unhandled
  // machine report is an open quality defect, so it holds the metric red until
  // someone closes it — recruiters get a button that actually moves the score.
  const [{ count: openMachineReports }, { count: weekMachineReports }] = await Promise.all([
    db
      .from("recruiter_feedback")
      .select("*", { count: "exact", head: true })
      .eq("category", "machine")
      .neq("status", "handled"),
    db
      .from("recruiter_feedback")
      .select("*", { count: "exact", head: true })
      .eq("category", "machine")
      .gte("created_at", since),
  ]);
  const openReports = openMachineReports ?? 0;
  const weekReports = weekMachineReports ?? 0;

  const firstAsst = new Map<string, number>();
  const firstRec = new Map<string, number>();
  for (const m of msgs) {
    const t = new Date(m.created_at).getTime();
    if (m.role === "assistant" && !firstAsst.has(m.lead_id)) firstAsst.set(m.lead_id, t);
    if (m.role === "recruiter" && !firstRec.has(m.lead_id)) firstRec.set(m.lead_id, t);
  }

  let gubgetFirst = 0, humanFirst = 0, endToEnd = 0, gubgetTouched = 0, escalated = 0;
  const respMins: number[] = [];
  for (const l of leadList) {
    const a = firstAsst.get(l.id);
    const r = firstRec.get(l.id);
    if (a !== undefined) {
      gubgetTouched++;
      if (l.needs_human_attention) escalated++;
      if (r === undefined) endToEnd++;
      const created = new Date(l.created_at).getTime();
      if (a >= created) respMins.push((a - created) / 60000);
    }
    if (a === undefined && r === undefined) continue;
    if ((a ?? Infinity) < (r ?? Infinity)) gubgetFirst++; else humanFirst++;
  }

  const contacted = gubgetFirst + humanFirst;
  const pctFirst = contacted ? Math.round((gubgetFirst / contacted) * 100) : 0;
  const pctEndToEnd = gubgetTouched ? Math.round((endToEnd / gubgetTouched) * 100) : 0;
  const escRate = gubgetTouched ? Math.round((escalated / gubgetTouched) * 100) : 0;
  respMins.sort((x, y) => x - y);
  const medResp = respMins.length ? respMins[Math.floor(respMins.length / 2)] : null;

  const metrics: { label: string; value: string; target: string; ok: boolean; hint: string; href?: string }[] = [
    { label: "גובגט עונה ראשונה", value: `${pctFirst}%`, target: "≥ 80%", ok: pctFirst >= 80, hint: `${gubgetFirst} מתוך ${contacted} שנוצר בהם קשר` },
    { label: "שיחה מקצה-לקצה בלי מגע אנושי", value: `${pctEndToEnd}%`, target: "≥ 70%", ok: pctEndToEnd >= 70, hint: `${endToEnd} מתוך ${gubgetTouched} שגובגט טיפלה` },
    { label: "שיעור הסלמה", value: `${escRate}%`, target: "< 25%", ok: gubgetTouched > 0 && escRate < 25, hint: `${escalated} הסלמות מתוך ${gubgetTouched}` },
    { label: "זמן תגובה חציוני", value: medResp === null ? "—" : `${medResp.toFixed(1)} דק'`, target: "< 2 דק'", ok: medResp !== null && medResp < 2, hint: `${respMins.length} שיחות נמדדו` },
    {
      label: "איכות לפי דיווחי הרכזות",
      value: openReports ? `${openReports} פתוחים` : "✓",
      target: "0 פתוחים",
      ok: openReports === 0,
      hint: openReports
        ? `${openReports} דיווחים על המכונה מחכים לטיפול`
        : weekReports
          ? `${weekReports} דיווחים על המכונה השבוע — כולם טופלו`
          : "אין דיווחים פתוחים על המכונה",
      href: "/feedback",
    },
  ];

  const met = metrics.filter((m) => m.ok).length;
  const lScore = (3.0 + met / 5).toFixed(1);

  return (
    <div dir="rtl" className="max-w-3xl mx-auto p-4 md:p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#0E2233]">מד אוטונומיה — L4</h1>
        <p className="text-sm text-gray-500 mt-1">כמה גובגט מטפלת לבד, 7 הימים האחרונים · {leadList.length} לידים</p>
      </div>

      <div className="bg-[#0E2233] text-white rounded-2xl p-6 flex items-center justify-between">
        <div>
          <div className="text-sm text-white/70">רמת אוטונומיה נוכחית</div>
          <div className="text-5xl font-black mt-1">L{lScore}</div>
          <div className="text-sm text-white/70 mt-1">{met}/5 מדדים ביעד · {met === 5 ? "L4 מוכח 🎉" : "מטפסת ל-L4"}</div>
        </div>
        <div className="text-6xl">{met === 5 ? "🚀" : "📈"}</div>
      </div>

      <div className="space-y-3">
        {metrics.map((m) => {
          const card = (
            <>
              <div className={`w-9 h-9 rounded-full flex items-center justify-center text-lg flex-shrink-0 ${m.ok ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-400"}`}>
                {m.ok ? "✓" : "○"}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-[#0E2233]">{m.label}</div>
                <div className="text-xs text-gray-500 mt-0.5">{m.hint}</div>
              </div>
              <div className="text-left flex-shrink-0">
                <div className={`text-xl font-bold ${m.ok ? "text-green-600" : "text-[#0E2233]"}`}>{m.value}</div>
                <div className="text-[11px] text-gray-400">יעד {m.target}</div>
              </div>
            </>
          );
          const cls = `bg-white border rounded-xl p-4 flex items-center gap-4 ${m.ok ? "border-green-300" : "border-gray-200"}`;
          return m.href ? (
            <Link key={m.label} href={m.href} className={`${cls} hover:border-[#0875E1] transition-colors`}>
              {card}
            </Link>
          ) : (
            <div key={m.label} className={cls}>
              {card}
            </div>
          );
        })}
      </div>

      <p className="text-xs text-gray-400 text-center pt-2 border-t border-gray-100">
        מתעדכן בכל טעינה · assistant=גובגט · recruiter=רכז/ת · חלון 7 ימים
      </p>
    </div>
  );
}
