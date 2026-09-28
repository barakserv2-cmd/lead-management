"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Building2,
  Briefcase,
  Users,
  CalendarCheck,
  CalendarDays,
  CalendarClock,
  BarChart3,
  Megaphone,
  Settings,
  MessageSquareWarning,
  Gauge,
  Radar,
  ClipboardList,
  Sun,
} from "lucide-react";

// קבוצות לפי שאלה שהרכזת שואלת: מה לעשות עכשיו / על מה מגייסים /
// איך הולך / הגדרות. היום שלי ראשון בכוונה — זה המסך של הבוקר.
const NAV_GROUPS: { title: string | null; items: { href: string; label: string; icon: typeof Sun }[] }[] = [
  {
    title: null,
    items: [
      { href: "/my-day", label: "היום שלי", icon: Sun },
      { href: "/leads", label: "לידים", icon: Users },
      { href: "/today", label: "לידים של היום", icon: CalendarCheck },
      { href: "/interviews", label: "ראיונות", icon: CalendarClock },
    ],
  },
  {
    title: "גיוס",
    items: [
      { href: "/clients", label: "מעסיקים", icon: Building2 },
      { href: "/jobs", label: "משרות", icon: Briefcase },
      { href: "/campaigns", label: "אקסטרות", icon: CalendarDays },
      { href: "/publishing", label: "פרסום בפייסבוק", icon: Megaphone },
    ],
  },
  {
    title: "תובנות",
    items: [
      { href: "/dashboard", label: "דשבורד", icon: LayoutDashboard },
      { href: "/reports", label: "דוחות", icon: BarChart3 },
      { href: "/channels", label: "ביצועי ערוצים", icon: Radar },
      { href: "/autonomy", label: "מד אוטונומיה", icon: Gauge },
    ],
  },
  {
    title: "מערכת",
    items: [
      { href: "/survey", label: "שאלון משוב", icon: ClipboardList },
      { href: "/feedback", label: "דיווח בעיות", icon: MessageSquareWarning },
      { href: "/settings", label: "הגדרות", icon: Settings },
    ],
  },
];

/** Flat list — the header reads it to name the current page. */
export const NAV_ITEMS = NAV_GROUPS.flatMap((g) => g.items);

export default function Sidebar({
  mobileOpen = false,
  onClose,
}: {
  /** narrow screens: the menu opens as a drawer from the header button */
  mobileOpen?: boolean;
  onClose?: () => void;
}) {
  const pathname = usePathname();
  // כמה דיווחי בעיות עדיין פתוחים. עד עכשיו דיווח נראה רק בסיכום היומי
  // ב-18:00, ולכן דיווח מהבוקר חיכה יום שלם. עכשיו הוא מסומן בתפריט.
  const [openReports, setOpenReports] = useState(0);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch("/api/feedback/open-count");
        const data = await res.json();
        if (alive) setOpenReports(Number(data.open) || 0);
      } catch {
        // רשת נפלה — הסימון פשוט לא מתעדכן
      }
    };
    load();
    const timer = setInterval(load, 120_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [pathname]);

  const content = (
    <>
        <div className="h-14 px-4 flex items-center gap-2.5 border-b border-gray-200">
          <div className="w-7 h-7 rounded-md bg-gray-900 text-white flex items-center justify-center text-[13px] font-bold">
            ב
          </div>
          <div className="leading-tight">
            <div className="text-[13px] font-semibold text-gray-900">ברק שירותים</div>
            <div className="text-[11px] text-gray-500">מערכת גיוס</div>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-4">
          {NAV_GROUPS.map((group, gi) => (
            <div key={gi}>
              {group.title && (
                <div className="px-2.5 pb-1 text-[11px] font-medium text-gray-400">{group.title}</div>
              )}
              <ul className="space-y-px">
                {group.items.map((item) => {
                  const isActive = pathname.startsWith(item.href);
                  const Icon = item.icon;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        aria-current={isActive ? "page" : undefined}
                        onClick={onClose}
                        className={`group flex items-center gap-2.5 h-8 px-2.5 rounded-md text-[13px] transition-colors ${
                          isActive
                            ? "bg-white text-gray-900 font-medium shadow-xs ring-1 ring-gray-200"
                            : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                        }`}
                      >
                        <Icon
                          className={`w-4 h-4 shrink-0 ${isActive ? "text-cyan-600" : "text-gray-400 group-hover:text-gray-600"}`}
                          strokeWidth={1.75}
                        />
                        <span className="truncate">{item.label}</span>
                        {item.href === "/feedback" && openReports > 0 && (
                          <span
                            className="ms-auto min-w-5 px-1.5 h-5 inline-flex items-center justify-center rounded-md bg-red-50 text-red-700 ring-1 ring-red-200 text-[11px] font-semibold tabular-nums"
                            title={`${openReports} דיווחים ממתינים לטיפול`}
                          >
                            {openReports}
                          </span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
    </>
  );

  return (
    <>
      <aside className="hidden lg:flex w-60 shrink-0 h-screen sticky top-0 bg-gray-50 border-e border-gray-200 flex-col">
        {content}
      </aside>

      {/* מסך צר: אותו תפריט כמגירה שנפתחת מכפתור בסרגל העליון */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-gray-900/40" onClick={onClose} aria-hidden />
          <aside
            className="absolute inset-y-0 right-0 w-72 max-w-[85vw] bg-gray-50 border-s border-gray-200 shadow-xl flex flex-col"
            role="dialog"
            aria-modal="true"
            aria-label="תפריט ניווט"
          >
            {content}
          </aside>
        </div>
      )}
    </>
  );
}
