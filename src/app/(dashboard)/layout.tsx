import AppShell from "@/components/layout/AppShell";
import { ChatWidget } from "@/components/chat-widget";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <AppShell>{children}</AppShell>
      <ChatWidget />
    </>
  );
}
