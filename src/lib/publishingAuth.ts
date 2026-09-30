// Auth + admin-client helper shared by the /api/publishing routes.
// Same shape as the other dashboard-facing routes: the cookie client proves
// there is a signed-in recruiter, the service-role client does the work.

import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { exactILike } from "@/lib/api-auth";

const ADMIN_ROLE = "אדמין";

export function admin() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export interface PublishingUser {
  email: string;
  isAdmin: boolean;
}

/** Resolves the signed-in recruiter, or null when there isn't one. */
export async function currentUser(): Promise<PublishingUser | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return null;

  const email = user.email.toLowerCase();
  const { data: profile } = await admin()
    .from("user_profiles")
    .select("role")
    .ilike("email", exactILike(email))
    .maybeSingle();
  // התחברות בלי שורה ב-user_profiles אינה רכזת (ראו getAuthedUser)
  if (!profile) return null;

  return { email, isAdmin: profile.role === ADMIN_ROLE };
}

export function unauthorized() {
  return NextResponse.json({ error: "לא מחובר/ת" }, { status: 401 });
}

export function bad(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}
