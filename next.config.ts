import type { NextConfig } from "next";

/**
 * כותרות אבטחה. עד 24.09 שתי המערכות הגישו דפים בלי אף אחת מהן.
 *
 * מה כל אחת מונעת בפועל:
 *  - frame-ancestors 'none' + X-Frame-Options: הטמעת הדשבורד ב-iframe באתר
 *    זר כדי לגנוב הקלקות (clickjacking) על כפתורים כמו "מחק" או "שלח".
 *  - nosniff: דפדפן שמנחש שקובץ שהועלה הוא סקריפט ומריץ אותו.
 *  - HSTS: שנה של חיוב HTTPS, כולל תת-דומיינים.
 *  - Referrer-Policy: דליפת נתיבים פנימיים (וטוקנים בכתובת) לאתרים חיצוניים.
 *  - Permissions-Policy: כיבוי מצלמה/מיקרופון/מיקום שאיננו משתמשים בהם.
 *
 * מה *לא* נכלל כאן במכוון: CSP מלא ל-script-src. Next מגיש סקריפטים
 * מוטבעים, ו-CSP שגוי משתיק את האפליקציה בלי שגיאה גלויה. frame-ancestors
 * הוא החלק מ-CSP שבטוח להוסיף בלי nonce, וזה מה שנוסף.
 */
const SECURITY_HEADERS = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
];

const nextConfig: NextConfig = {
  experimental: {
    // radix-ui intentionally excluded: it broke the AddLeadDialog submit
    // button in production (form click stopped firing onSubmit). The
    // unified `radix-ui` package's export shape doesn't play well with
    // Next.js's barrel-import optimization yet. Re-add only after a
    // verified retest if the package itself is fixed.
    optimizePackageImports: ["lucide-react", "recharts"],
  },
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
