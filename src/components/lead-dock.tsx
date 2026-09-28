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

  useEffect(() => {
    const missing = ids.filter((id) => !leads.some((l) => l.id === id));
    if (missing.length === 0) {
      // חלון שנסגר — משחררים את הליד מהזיכרון המקומי
      if (leads.length > ids.length) setLeads((prev) => prev.filter((l) => ids.includes(l.id)));
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/leads/by-ids?ids=${missing.join(",")}`);
        if (!res.ok) return;
        const data = (await res.json()) as { leads?: Lead[] };
        if (cancelled || !data.leads?.length) return;
        setLeads((prev) => {
          const have = new Set(prev.map((l) => l.id));
          const add = data.leads!.filter((l) => !have.has(l.id));
          return add.length ? [...prev, ...add] : prev;
        });
      } catch {
        // רשת נפלה — החלון פשוט לא ייפתח הפעם
      }
    })();
    return () => { cancelled = true; };
  }, [ids, leads]);

  if (ids.length === 0) return null;

  return (
    <LeadWindowManager
      leads={leads}
      openLeadIds={ids}
      chatFirstIds={new Set(chatFirst)}
      onOpenLead={openLeadWindow}
      onCloseLead={closeLeadWindow}
    />
  );
}
