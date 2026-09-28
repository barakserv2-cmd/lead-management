"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import Sidebar from "./Sidebar";
import Header from "./Header";

// המעטפת של המערכת: תפריט צד קבוע במסך רחב, ובמסך צר מגירה שנפתחת
// מכפתור בסרגל העליון ונסגרת במעבר עמוד.
export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [prevPath, setPrevPath] = useState(pathname);
  if (pathname !== prevPath) {
    setPrevPath(pathname);
    setMenuOpen(false);
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar mobileOpen={menuOpen} onClose={() => setMenuOpen(false)} />
      <div className="flex-1 min-w-0 flex flex-col bg-white">
        <Header onMenu={() => setMenuOpen(true)} />
        <main className="flex-1 min-w-0 px-4 py-5 sm:px-6 lg:px-8 lg:py-6">{children}</main>
      </div>
    </div>
  );
}
