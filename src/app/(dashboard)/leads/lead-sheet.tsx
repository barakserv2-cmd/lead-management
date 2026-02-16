"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { getLeadNotes, updateLeadNotes } from "./actions";

export interface SheetLead {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  location: string | null;
  job_title: string | null;
  experience: string | null;
  age: number | null;
  source: string;
  status: string;
  notes: string | null;
  created_at: string;
  financial_status: string;
  client_type: string | null;
  active_jobs_count: number;
  active_employees_count: number;
  recruitment_status: string;
  preferences: Record<string, unknown> | null;
}

const STATUS_COLORS: Record<string, string> = {
  "חדש": "bg-blue-100 text-blue-800",
  "מעורב": "bg-cyan-100 text-cyan-800",
  "בסינון": "bg-yellow-100 text-yellow-800",
  "מתאים": "bg-emerald-100 text-emerald-800",
  "נדחה": "bg-red-100 text-red-800",
};

const SOURCE_COLORS: Record<string, string> = {
  AllJobs: "bg-blue-100 text-blue-700",
  "אימייל ישיר": "bg-violet-100 text-violet-700",
  "וואטסאפ": "bg-green-100 text-green-700",
  "טלפון": "bg-amber-100 text-amber-700",
  "אחר": "bg-gray-100 text-gray-600",
  Facebook: "bg-indigo-100 text-indigo-700",
  Website: "bg-teal-100 text-teal-700",
};

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return parts[0][0] + parts[1][0];
  return name.slice(0, 2);
}

function formatPhone(phone: string | null): string | null {
  if (!phone) return null;
  return phone.replace(/[\s\-()]/g, "").replace(/^0/, "972");
}

export function LeadSheet({
  lead,
  onClose,
}: {
  lead: SheetLead | null;
  onClose: () => void;
}) {
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);

  // Fetch fresh notes from DB when sheet opens
  useEffect(() => {
    if (!lead) return;
    let cancelled = false;
    setLoading(true);
    getLeadNotes(lead.id).then((result) => {
      if (cancelled) return;
      setNotes(result.notes ?? "");
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [lead]);

  if (!lead) return null;

  const intlPhone = formatPhone(lead.phone);
  const statusColor = STATUS_COLORS[lead.status] ?? "bg-gray-100 text-gray-800";
  const sourceColor = SOURCE_COLORS[lead.source] ?? "bg-gray-100 text-gray-600";

  async function handleSaveNotes() {
    setSaving(true);
    const result = await updateLeadNotes(lead!.id, notes);
    setSaving(false);
    if (result.error) {
      toast.error("שגיאה בשמירת ההערות");
    } else {
      toast.success("ההערות נשמרו!");
    }
  }

  const fields = [
    { label: "טלפון", value: lead.phone, dir: "ltr" as const },
    { label: "אימייל", value: lead.email, dir: "ltr" as const },
    { label: "מיקום", value: lead.location },
    { label: "תפקיד", value: lead.job_title },
    { label: "ניסיון", value: lead.experience },
    { label: "גיל", value: lead.age?.toString() },
    { label: "תאריך", value: new Date(lead.created_at).toLocaleDateString("he-IL") },
  ];

  return (
    <Sheet open={true} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent side="left" className="w-full sm:max-w-md overflow-y-auto p-0">
        {/* Header */}
        <SheetHeader className="border-b px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-bold flex-shrink-0">
              {getInitials(lead.name)}
            </span>
            <div>
              <SheetTitle className="text-lg">{lead.name}</SheetTitle>
              <SheetDescription className="flex items-center gap-2 mt-1">
                <span className={"inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold " + statusColor}>
                  {lead.status}
                </span>
                <span className={"inline-block px-2 py-0.5 rounded-full text-[10px] font-medium " + sourceColor}>
                  {lead.source}
                </span>
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        {/* Quick Actions */}
        {intlPhone && (
          <div className="flex gap-2 px-6 py-3 border-b">
            <a
              href={"tel:" + lead.phone}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-blue-50 text-blue-700 text-sm font-medium hover:bg-blue-100 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
              </svg>
              התקשר
            </a>
            <a
              href={"https://api.whatsapp.com/send?phone=" + intlPhone}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-green-50 text-green-700 text-sm font-medium hover:bg-green-100 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z" />
              </svg>
              WhatsApp
            </a>
          </div>
        )}

        {/* Details */}
        <div className="px-6 py-4 border-b">
          <h3 className="text-sm font-semibold text-gray-500 mb-3">פרטים</h3>
          <div className="grid grid-cols-2 gap-3">
            {fields.map((f) => (
              <div key={f.label} className="bg-gray-50 rounded-lg px-3 py-2">
                <p className="text-[11px] text-gray-400 font-medium">{f.label}</p>
                <p className="text-sm font-medium text-gray-800 mt-0.5" dir={f.dir}>
                  {f.value ?? "—"}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Notes */}
        <div className="px-6 py-4">
          <h3 className="text-sm font-semibold text-gray-500 mb-2">הערות</h3>
          {loading ? (
            <div className="flex items-center justify-center py-8 text-gray-400 text-sm">
              טוען הערות...
            </div>
          ) : (
            <>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={8}
                className="resize-none text-sm"
                placeholder="הוסף הערות על הליד..."
              />
              <Button
                onClick={handleSaveNotes}
                disabled={saving}
                className="mt-3 w-full"
              >
                {saving ? "שומר..." : "שמור הערות"}
              </Button>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
