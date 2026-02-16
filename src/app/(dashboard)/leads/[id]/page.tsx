import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { STATUS_COLORS } from "@/lib/constants";
import type { Lead } from "@/types/leads";
import type { LeadStatus } from "@/lib/constants";

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: lead, error } = await supabase
    .from("leads")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !lead) {
    notFound();
  }

  const typedLead = lead as Lead;
  const statusColor = STATUS_COLORS[typedLead.status as LeadStatus] ?? "bg-gray-100 text-gray-800";

  const fields = [
    { label: "טלפון", value: typedLead.phone, dir: "ltr" as const },
    { label: "אימייל", value: typedLead.email, dir: "ltr" as const },
    { label: "מיקום", value: typedLead.location },
    { label: "תפקיד", value: typedLead.job_title },
    { label: "ניסיון", value: typedLead.experience },
    { label: "גיל", value: typedLead.age?.toString() },
    { label: "מקור", value: typedLead.source },
    { label: "תאריך יצירה", value: new Date(typedLead.created_at).toLocaleDateString("he-IL") },
  ];

  return (
    <div>
      <Link href="/leads" className="text-blue-600 hover:underline text-sm mb-4 inline-block">
        &rarr; חזרה לרשימת הלידים
      </Link>

      <div className="bg-white rounded-xl shadow-sm border p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">{typedLead.name}</h1>
          <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${statusColor}`}>
            {typedLead.status}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {fields.map((field) => (
            <div key={field.label}>
              <p className="text-sm text-gray-500">{field.label}</p>
              <p className="font-medium" dir={field.dir}>
                {field.value ?? "—"}
              </p>
            </div>
          ))}
        </div>

        {typedLead.notes && (
          <div className="mt-6 border-t pt-4">
            <p className="text-sm text-gray-500 mb-1">הערות</p>
            <p className="whitespace-pre-wrap text-gray-700">{typedLead.notes}</p>
          </div>
        )}
      </div>
    </div>
  );
}
