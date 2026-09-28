import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import { ChatWidget } from "@/components/chat-widget";
import { LeadDock } from "@/components/lead-dock";
import { QuickFind } from "@/components/quick-find";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <Header />
        <main className="flex-1 p-6 bg-slate-50">{children}</main>
      </div>
      <ChatWidget />
      {/* חלונות המועמדים והחיפוש המהיר חיים כאן ולא בעמוד הלידים,
          כדי שלא ייעלמו במעבר בין דפים (ראו lib/leadWindows.ts) */}
      <LeadDock />
      <QuickFind />
    </div>
  );
}
