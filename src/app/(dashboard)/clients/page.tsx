import { createClient } from "@/lib/supabase/server";
import type { Client } from "@/types/clients";
import { ClientsContent } from "./clients-content";

export default async function ClientsPage() {
  const supabase = await createClient();

  const { data: clients } = await supabase
    .from("clients")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);

  return <ClientsContent clients={(clients ?? []) as Client[]} />;
}
