import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import { ChatWidget } from "@/components/chat-widget";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex-1 min-w-0 flex flex-col bg-white">
        <Header />
        <main className="flex-1 px-8 py-6">{children}</main>
      </div>
      <ChatWidget />
    </div>
  );
}
