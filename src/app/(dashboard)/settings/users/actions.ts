"use server";

import { createClient as createServerClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { getAuthedUser, requireRecruiter } from "@/lib/api-auth";

function getSupabase() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// server actions נגישות לכל מי שמשיג את ה-action id — בלי הבדיקות כאן
// כל משתמש (גם לא אדמין) היה יכול ליצור/לערוך/למחוק משתמשים.
const NOT_ADMIN = "פעולה זו מוגבלת לאדמין";

async function requireAdminActor(): Promise<string | null> {
  const user = await getAuthedUser();
  return user?.isAdmin ? user.email : null;
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: string;
  created_at: string;
  /** false = רואה רק את השיחות שלה (במספר שלה, וגובגט רק בלידים שבטיפולה) */
  sees_shared_chats?: boolean;
}

export async function getUsers() {
  await requireRecruiter();

  const { data, error } = await getSupabase()
    .from("user_profiles")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return { users: [] as UserProfile[], error: error.message };
  return { users: (data ?? []) as UserProfile[], error: null };
}

export async function createUser(user: {
  name: string;
  email: string;
  role: string;
  sees_shared_chats?: boolean;
}) {
  if (!(await requireAdminActor())) return { user: null, error: NOT_ADMIN };

  const { data, error } = await getSupabase()
    .from("user_profiles")
    .insert({
      name: user.name,
      email: user.email.trim().toLowerCase(),
      role: user.role,
      ...(typeof user.sees_shared_chats === "boolean" ? { sees_shared_chats: user.sees_shared_chats } : {}),
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return { user: null, error: "אימייל זה כבר קיים במערכת" };
    }
    return { user: null, error: error.message };
  }

  revalidatePath("/settings/users");
  return { user: data as UserProfile, error: null };
}

export async function updateUser(
  id: string,
  user: { name: string; email: string; role: string; sees_shared_chats?: boolean }
) {
  if (!(await requireAdminActor())) return { user: null, error: NOT_ADMIN };

  const { data, error } = await getSupabase()
    .from("user_profiles")
    .update({
      name: user.name,
      email: user.email.trim().toLowerCase(),
      role: user.role,
      ...(typeof user.sees_shared_chats === "boolean" ? { sees_shared_chats: user.sees_shared_chats } : {}),
    })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return { user: null, error: "אימייל זה כבר קיים במערכת" };
    }
    return { user: null, error: error.message };
  }

  revalidatePath("/settings/users");
  return { user: data as UserProfile, error: null };
}

export async function deleteUser(id: string) {
  const actor = await requireAdminActor();
  if (!actor) return { error: NOT_ADMIN };

  const supabase = getSupabase();
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("email")
    .eq("id", id)
    .maybeSingle();
  const email = (profile?.email as string | undefined)?.trim().toLowerCase();
  if (email && email === actor) return { error: "אי אפשר למחוק את המשתמש שלך" };

  const { error } = await supabase
    .from("user_profiles")
    .delete()
    .eq("id", id);

  if (error) return { error: error.message };

  // מחיקת הפרופיל לבדה השאירה את חשבון ההתחברות חי: עובדת שעזבה המשיכה
  // להתחבר, ונתיבים שבדקו רק "יש session" נתנו לה גישה מלאה. מוחקים גם אותו.
  if (email) {
    const authErr = await deleteAuthAccount(email);
    if (authErr) {
      revalidatePath("/settings/users");
      return { error: `המשתמש/ת הוסר/ה מהרשימה, אבל חשבון ההתחברות לא נמחק: ${authErr}` };
    }
  }

  revalidatePath("/settings/users");
  return { error: null };
}

/** מוחק את חשבון ההתחברות (auth.users) של האימייל, אם קיים. מחזיר הודעת שגיאה או null. */
async function deleteAuthAccount(email: string): Promise<string | null> {
  const supabase = getSupabase();
  for (let page = 1; page <= 5; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 100 });
    if (error) return error.message;
    const hit = data.users.find((u) => u.email?.toLowerCase() === email);
    if (hit) {
      const { error: delErr } = await supabase.auth.admin.deleteUser(hit.id);
      return delErr ? delErr.message : null;
    }
    if (data.users.length < 100) return null;
  }
  return null;
}
