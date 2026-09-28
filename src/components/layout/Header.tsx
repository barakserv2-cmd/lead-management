"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { openQuickFind } from "@/lib/quickFind";

export default function Header() {
  const router = useRouter();

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="h-16 bg-white/80 backdrop-blur-sm border-b border-gray-200 border-t-2 border-t-cyan-600 flex items-center justify-between px-6">
      {/* נכנסת שיחה וצריך לדעת מי מתקשר: נפתח כחלון צף, בלי לעזוב
          את המסך הנוכחי. כפתור ולא רק Ctrl+K — בטאבלט אין מקלדת. */}
      <button
        type="button"
        onClick={openQuickFind}
        title="חיפוש מהיר של מועמד/ת לפי שם או טלפון"
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-500 hover:text-cyan-700 hover:border-cyan-300 hover:bg-cyan-50/50 transition-colors"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="w-4 h-4">
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        <span>מי מתקשר?</span>
        <kbd className="hidden md:inline text-[10px] text-gray-400 border border-gray-200 rounded px-1 py-0.5 font-sans">Ctrl K</kbd>
      </button>
      <div className="flex items-center gap-4">
        <span className="text-sm text-gray-600">אדמין</span>
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-cyan-500 to-cyan-700 text-white flex items-center justify-center text-sm font-medium">
          א
        </div>
        <button
          onClick={handleLogout}
          className="text-sm text-gray-500 hover:text-red-600 transition-colors"
        >
          התנתקות
        </button>
      </div>
    </header>
  );
}
