"use server";

import { createClient as createServerClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { getAuthedUser } from "@/lib/api-auth";

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
}

export async function getUsers() {
  const user = await getAuthedUser();
  if (!user) return { users: [] as UserProfile[], error: "לא מחובר/ת" };

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
}) {
  if (!(await requireAdminActor())) return { user: null, error: NOT_ADMIN };

  const { data, error } = await getSupabase()
    .from("user_profiles")
    .insert({
      name: user.name,
      email: user.email.trim().toLowerCase(),
      role: user.role,
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
  user: { name: string; email: string; role: string }
) {
  if (!(await requireAdminActor())) return { user: null, error: NOT_ADMIN };

  const { data, error } = await getSupabase()
    .from("user_profiles")
    .update({
      name: user.name,
      email: user.email.trim().toLowerCase(),
      role: user.role,
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
  if (!(await requireAdminActor())) return { error: NOT_ADMIN };

  const { error } = await getSupabase()
    .from("user_profiles")
    .delete()
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/settings/users");
  return { error: null };
}
