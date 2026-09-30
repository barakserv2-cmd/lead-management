import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createClient as createCookieClient } from "@/lib/supabase/server";
import { safeEqual } from "@/lib/secrets";

// Validate API key from Authorization header
export function validateApiKey(request: NextRequest): boolean {
  const authHeader = request.headers.get("authorization");
  if (!authHeader) return false;

  const secret = process.env.API_SECRET_KEY;
  if (!secret) return false;
  return safeEqual(authHeader.replace("Bearer ", ""), secret);
}

export function unauthorizedResponse() {
  return NextResponse.json(
    { error: "Unauthorized. Provide a valid Bearer token in the Authorization header." },
    { status: 401 }
  );
}

// Admin Supabase client for API routes (bypasses RLS)
export function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL environment variable");
  }

  const key = serviceRoleKey || anonKey;
  if (!key) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY environment variable");
  }

  if (!serviceRoleKey) {
    console.warn("[api-auth] SUPABASE_SERVICE_ROLE_KEY not set — falling back to anon key. RLS-protected tables may be inaccessible.");
  }

  return createClient(supabaseUrl, key);
}

// ── אכיפת תפקידים בצד השרת (שלב 2 בתוכנית העבודה) ──────────
// עד עכשיו role ב-user_profiles היה תגית תצוגה בלבד — ה-UI הסתיר
// כפתורים אבל השרת קיבל כל בקשה ממשתמש מחובר. מעכשיו נתיבים רגישים
// עוברים דרך requireAdmin, באותה קונבנציה כמו publishingAuth.

export const ADMIN_ROLE = "אדמין";

export interface AuthedUser {
  email: string;
  isAdmin: boolean;
}

/**
 * ILIKE בלי תווים כלליים: `%` ו-`_` חוקיים בחלק המקומי של אימייל, ובלי
 * בריחה `x%@eilatjobs.com` היה תואם לשורה של אדמין (ועדת בחינה, 29/09).
 */
export function exactILike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** השורה ב-user_profiles של האימייל (התאמה מדויקת, לא תלוית רישיות), או null. */
export async function findProfileByEmail(
  email: string
): Promise<{ role: string | null; name: string | null } | null> {
  const { data } = await getSupabaseAdmin()
    .from("user_profiles")
    .select("role, name")
    .ilike("email", exactILike(email.toLowerCase()))
    .maybeSingle();
  return data ?? null;
}

/**
 * המשתמש/ת המחובר/ת + תפקיד, או null כשאין session **או שאין שורה ב-user_profiles**.
 * התחברות לבדה אינה "רכזת": הרשמה עצמית פתוחה ב-Supabase, ומחיקת רכזת מוחקת
 * את הפרופיל — בלי הבדיקה הזו שני אלה היו מקבלים גישה מלאה דרך ה-API.
 */
export async function getAuthedUser(): Promise<AuthedUser | null> {
  const supabase = await createCookieClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return null;

  const email = user.email.toLowerCase();
  const profile = await findProfileByEmail(email);
  if (!profile) return null;

  return { email, isAdmin: profile.role === ADMIN_ROLE };
}

/**
 * שומר ל-server actions. כל פעולה מיוצאת בקובץ "use server" נגישה ב-POST לכל
 * מי שמחזיק את מזהה הפעולה (הוא נמצא ב-JS הציבורי), ולכן כל אחת חייבת לבדוק
 * בעצמה. זורק כשאין רכזת מחוברת (או כשנדרש אדמין ואין).
 */
export async function requireRecruiter(opts: { admin?: boolean } = {}): Promise<AuthedUser> {
  const user = await getAuthedUser();
  if (!user) throw new Error("לא מחובר/ת");
  if (opts.admin && !user.isAdmin) throw new Error("פעולה זו מוגבלת לאדמין");
  return user;
}

/**
 * שימוש בנתיב API:
 *   const auth = await requireAdmin();
 *   if (auth instanceof NextResponse) return auth;
 *   // auth.email זמין מכאן
 */
export async function requireAdmin(): Promise<AuthedUser | NextResponse> {
  const user = await getAuthedUser();
  if (!user) {
    return NextResponse.json({ error: "לא מחובר/ת" }, { status: 401 });
  }
  if (!user.isAdmin) {
    return NextResponse.json({ error: "פעולה זו מוגבלת לאדמין" }, { status: 403 });
  }
  return user;
}
