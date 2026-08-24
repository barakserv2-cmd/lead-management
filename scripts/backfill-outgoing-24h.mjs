// One-off: backfill phone-app-sent (non-API) outgoing WhatsApp messages from
// the last 24h into the CRM chat, for every linked instance.
import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";

const env = {};
for (const l of readFileSync("C:/Users/Barak/Projects/lead-management/.env.local", "utf8").split(/\r?\n/)) {
  const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.*)$/);
  if (m) env[m[1]] = m[2].trim().replace(/^"|"$/g, "");
}
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

function phoneVariants(chatId) {
  const digits = chatId.replace(/@c\.us$/, "");
  const local = digits.startsWith("972") ? "0" + digits.slice(3) : digits;
  return [local, `${local.slice(0, 3)}-${local.slice(3)}`, `+972${local.slice(1)}`, `972${local.slice(1)}`];
}

const { data: accs } = await db.from("whatsapp_accounts").select("user_email, instance_id, api_token");
let inserted = 0, skipped = 0;
for (const a of accs) {
  const r = await fetch(`https://api.green-api.com/waInstance${a.instance_id}/lastOutgoingMessages/${a.api_token}?minutes=1440`);
  if (!r.ok) { console.log(a.user_email, "lastOutgoingMessages", r.status); continue; }
  const msgs = await r.json();
  for (const m of msgs) {
    if (m.typeMessage !== "textMessage" && m.typeMessage !== "extendedTextMessage") continue;
    if (m.sendByApi) continue; // CRM/API sends are already in the chat
    if (!m.chatId || m.chatId.endsWith("@g.us")) continue;
    const text = m.textMessage ?? m.extendedTextMessage?.text ?? "";
    if (!text) continue;

    const { data: leads } = await db.from("leads").select("id").in("phone", phoneVariants(m.chatId))
      .order("created_at", { ascending: false }).limit(1);
    const lead = leads?.[0];
    if (!lead) { skipped++; continue; }

    const ts = new Date(m.timestamp * 1000).toISOString();
    // dedup: same lead + same content within ±3 minutes
    const lo = new Date(m.timestamp * 1000 - 3 * 60000).toISOString();
    const hi = new Date(m.timestamp * 1000 + 3 * 60000).toISOString();
    const { data: dup } = await db.from("messages").select("id").eq("lead_id", lead.id)
      .eq("content", text).gte("created_at", lo).lte("created_at", hi).limit(1);
    if (dup?.length) { skipped++; continue; }

    const { error } = await db.from("messages").insert({
      lead_id: lead.id, role: "recruiter", content: text,
      sent_by: a.user_email, via_instance: a.instance_id, created_at: ts,
    });
    if (error) console.log("insert err", error.message);
    else inserted++;
  }
}
console.log({ inserted, skipped });
