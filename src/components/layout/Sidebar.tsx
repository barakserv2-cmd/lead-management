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

const NAV_ITEMS = [
  // ראשון בכוונה: זה המסך שרכזת פותחת בבוקר במקום לחפש בחמישה דפים
  { href: "/my-day", label: "היום שלי", icon: Sun },
  { href: "/dashboard", label: "דשבורד", icon: LayoutDashboard },
  { href: "/clients", label: "מעסיקים", icon: Building2 },
  { href: "/jobs", label: "משרות", icon: Briefcase },
  { href: "/leads", label: "לידים", icon: Users },
  { href: "/today", label: "לידים של היום", icon: CalendarCheck },
  { href: "/interviews", label: "ראיונות", icon: CalendarClock },
  { href: "/campaigns", label: "אקסטרות", icon: CalendarDays },
  { href: "/publishing", label: "פרסום בפייסבוק", icon: Megaphone },
  { href: "/reports", label: "דוחות", icon: BarChart3 },
  { href: "/autonomy", label: "מד אוטונומיה", icon: Gauge },
  { href: "/channels", label: "ביצועי ערוצים", icon: Radar },
  { href: "/survey", label: "שאלון משוב", icon: ClipboardList },
  { href: "/feedback", label: "דיווח בעיות", icon: MessageSquareWarning },
  { href: "/settings", label: "הגדרות", icon: Settings },
];

export default function Sidebar() {
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

  return (
    <aside className="w-64 min-h-screen bg-gradient-to-b from-[#0c1222] to-[#162032] text-white flex flex-col">
      <div className="p-6 border-b border-white/[0.08]">
        <h1 className="text-xl font-bold tracking-tight">ברק שירותים</h1>
        <p className="text-sm text-white/60 mt-1">מערכת גיוס</p>
      </div>
      <nav className="flex-1 p-4">
        <ul className="space-y-1">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                    isActive
                      ? "bg-white/10 text-cyan-400 border-r-2 border-cyan-400"
                      : "text-white/60 hover:bg-white/[0.06] hover:text-white/90"
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  <span>{item.label}</span>
                  {item.href === "/feedback" && openReports > 0 && (
                    <span
                      className="mr-auto min-w-5 px-1.5 h-5 inline-flex items-center justify-center rounded-full bg-red-500 text-white text-[11px] font-bold tabular-nums"
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
      </nav>
      <div className="p-4 border-t border-white/[0.08]">
        <p className="text-[11px] text-white/30 text-center">Powered by Barak</p>
      </div>
    </aside>
  );
}
