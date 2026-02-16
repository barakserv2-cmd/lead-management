import type { Metadata } from "next";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: "EilatJobs — ניהול לידים",
  description: "מערכת ניהול לידים חכמה לחברות כוח אדם",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="he" dir="rtl">
      <body className="antialiased">
        {children}
        <Toaster position="bottom-center" dir="rtl" />
      </body>
    </html>
  );
}
