"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, Search } from "lucide-react";
import { NAV_ITEMS } from "./Sidebar";

export default function Header() {
  const router = useRouter();
  const pathname = usePathname();
  const [q, setQ] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // שם העמוד הנוכחי — כמו פירורי לחם, כדי שתמיד ברור איפה נמצאים
  const current = NAV_ITEMS.find((i) => pathname.startsWith(i.href));

  // ⌘K / Ctrl+K — חיפוש מועמד מכל מסך במערכת
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  function search() {
    const term = q.trim();
    if (!term) return;
    // חיפוש גלובלי = בכל הלידים, לא רק בתור החדשים
    router.push(`/leads?source=__all__&q=${encodeURIComponent(term)}`);
    inputRef.current?.blur();
  }

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="h-14 sticky top-0 z-30 bg-white/90 backdrop-blur border-b border-gray-200 flex items-center justify-between gap-4 px-6">
      <div className="flex items-center gap-2 text-[13px] min-w-0">
        <span className="text-gray-400">ברק שירותים</span>
        {current && (
          <>
            <span className="text-gray-300">/</span>
            <span className="font-medium text-gray-900 truncate">{current.label}</span>
          </>
        )}
      </div>

      <div className="flex-1 max-w-sm">
        <div className="relative">
          <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" strokeWidth={1.75} />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") search();
              if (e.key === "Escape") { setQ(""); inputRef.current?.blur(); }
            }}
            placeholder="חיפוש מועמד לפי שם או טלפון"
            aria-label="חיפוש מועמד"
            className="w-full h-8 pr-8 pl-14 rounded-md border border-gray-200 bg-gray-50 text-[13px] placeholder:text-gray-400 focus:bg-white focus:outline-none focus:border-cyan-400 focus:ring-4 focus:ring-cyan-100 transition-colors"
          />
          <kbd className="absolute left-2 top-1/2 -translate-y-1/2 hidden sm:inline-flex items-center px-1.5 h-5 rounded border border-gray-200 bg-white text-[10px] text-gray-400 font-sans" dir="ltr">
            Ctrl K
          </kbd>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div className="flex items-center gap-2 px-1.5 py-1 rounded-md">
          <div className="w-7 h-7 rounded-full bg-gray-100 ring-1 ring-gray-200 text-gray-700 flex items-center justify-center text-xs font-semibold">
            א
          </div>
          <span className="text-[13px] text-gray-700 hidden md:inline">אדמין</span>
        </div>
        <button
          onClick={handleLogout}
          title="התנתקות"
          aria-label="התנתקות"
          className="w-8 h-8 inline-flex items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition-colors"
        >
          <LogOut className="w-4 h-4" strokeWidth={1.75} />
        </button>
      </div>
    </header>
  );
}
