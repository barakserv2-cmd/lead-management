import AppShell from "@/components/layout/AppShell";
import { ChatWidget } from "@/components/chat-widget";
import { LeadDock } from "@/components/lead-dock";
import { QuickFind } from "@/components/quick-find";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <AppShell>{children}</AppShell>
      <ChatWidget />
      {/* חלונות המועמדים והחיפוש המהיר חיים כאן ולא בעמוד הלידים,
          כדי שלא ייעלמו במעבר בין דפים (ראו lib/leadWindows.ts) */}
      <LeadDock />
      <QuickFind />
    </>
  );
}
