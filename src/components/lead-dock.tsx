"use client";

import { useEffect, useState } from "react";
import type { Lead } from "@/types/leads";
import { LeadWindowManager } from "@/app/(dashboard)/leads/lead-mini-windows";
import { closeLeadWindow, openLeadWindow, useLeadWindows } from "@/lib/leadWindows";

/**
 * רציף החלונות — יושב בלייאאוט, ולכן קיים בכל דף במערכת.
 *
 * קודם הוא חי בתוך עמוד הלידים בלבד, אז מעבר ל"היום שלי" או לכרטיס
 * מועמד הפיל את כל מה שהיה פתוח. כאן הוא מחזיק את עצמו: קורא את
 * המזהים מהחנות המשותפת ושולף את הלידים בעצמו, בלי תלות במה שהעמוד
 * שמתחתיו במקרה טען.
 *
 * הוא לא זורק לעולם — כישלון רשת מוריד חלון, לא את המערכת.
 */
export function LeadDock() {
  const { ids, chatFirst } = useLeadWindows();
  const [leads, setLeads] = useState<Lead[]>([]);

  // רק הלידים של חלונות פתוחים. ליד של חלון שנסגר נשאר בזיכרון עד הטעינה
  // הבאה (שם הוא מנוקה), וכשהחלון נפתח שוב הוא נשלף מחדש — לא מוצג מהעותק הישן.
  const openLeads = leads.filter((l) => ids.includes(l.id));

  useEffect(() => {
    const missing = ids.filter((id) => !openLeads.some((l) => l.id === id));
    if (missing.length === 0) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/leads/by-ids?ids=${missing.join(",")}`);
        if (!res.ok) return;
        const data = (await res.json()) as { leads?: Lead[] };
        if (cancelled || !data.leads?.length) return;
        setLeads((prev) => {
          const fetched = new Set(data.leads!.map((l) => l.id));
          // משחררים לידים של חלונות שנסגרו ועותקים ישנים של מה שנשלף עכשיו
          return [...prev.filter((l) => ids.includes(l.id) && !fetched.has(l.id)), ...data.leads!];
        });
      } catch {
        // רשת נפלה — החלון פשוט לא ייפתח הפעם
      }
    })();
    return () => { cancelled = true; };
    // openLeads נגזר מ-leads ו-ids בכל רינדור
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids, leads]);

  if (ids.length === 0) return null;

  return (
    <LeadWindowManager
      leads={openLeads}
      openLeadIds={ids}
      chatFirstIds={new Set(chatFirst)}
      onOpenLead={openLeadWindow}
      onCloseLead={closeLeadWindow}
    />
  );
}
