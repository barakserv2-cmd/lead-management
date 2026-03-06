"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Building2,
  Briefcase,
  Users,
  CalendarDays,
  BarChart3,
  Settings,
} from "lucide-react";

const NAV_ITEMS = [
  { href: "/dashboard", label: "דשבורד", icon: LayoutDashboard },
  { href: "/clients", label: "מעסיקים", icon: Building2 },
  { href: "/jobs", label: "משרות", icon: Briefcase },
  { href: "/leads", label: "לידים", icon: Users },
  { href: "/campaigns", label: "אקסטרות", icon: CalendarDays },
  { href: "/reports/hired", label: "דוח מועסקים", icon: BarChart3 },
  { href: "/settings", label: "הגדרות", icon: Settings },
];

export default function Sidebar() {
  const pathname = usePathname();

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
