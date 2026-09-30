import type { Metadata } from "next";
import { Inter, Heebo } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

// Inter for Latin letters and digits, Heebo for Hebrew — self-hosted by
// next/font, so no layout shift and no request to Google at runtime.
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const heebo = Heebo({ subsets: ["hebrew", "latin"], variable: "--font-heebo", display: "swap" });

export const metadata: Metadata = {
  title: "ברק שירותים — מערכת גיוס",
  description: "מערכת ניהול גיוס חכמה — ברק שירותים",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="he" dir="rtl" className={`${inter.variable} ${heebo.variable}`}>
      <body className="antialiased">
        {children}
        <Toaster position="bottom-center" dir="rtl" />
      </body>
    </html>
  );
}
