"use server";

import { createClient as createServerClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";

function getSupabase() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: string;
  created_at: string;
}

export async function getUsers() {
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
  const { data, error } = await getSupabase()
    .from("user_profiles")
    .insert({
      name: user.name,
      email: user.email,
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
  const { data, error } = await getSupabase()
    .from("user_profiles")
    .update({
      name: user.name,
      email: user.email,
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
  const { error } = await getSupabase()
    .from("user_profiles")
    .delete()
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/settings/users");
  return { error: null };
}
