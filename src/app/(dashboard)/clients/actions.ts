"use server";

import { createClient as createServerClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";

function getSupabase() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function getClients(status?: string, search?: string) {
  let query = getSupabase()
    .from("clients")
    .select("*")
    .order("created_at", { ascending: false });

  if (status && status !== "all") {
    query = query.eq("status", status);
  }

  if (search) {
    query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%`);
  }

  const { data, error } = await query.limit(100);

  if (error) return { clients: [], error: error.message };
  return { clients: data ?? [], error: null };
}

export async function createClient(client: {
  name: string;
  contact_person: string;
  phone: string;
  email: string;
  type: string;
  city: string;
}) {
  const { data, error } = await getSupabase()
    .from("clients")
    .insert({
      name: client.name,
      contact_person: client.contact_person || null,
      phone: client.phone,
      email: client.email || null,
      type: client.type || "Other",
      city: client.city || null,
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return { client: null, error: "מספר טלפון זה כבר קיים במערכת" };
    }
    return { client: null, error: error.message };
  }

  revalidatePath("/clients");
  return { client: data, error: null };
}
