"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getLeadNotes, updateLeadNotes, updateLeadDetails } from "./actions";
import { ConversationSheet } from "./[id]/conversation-sheet";
import type { Lead } from "@/types/leads";
import {
  STATUS_COLORS as SM_STATUS_COLORS,
  STATUS_LABELS,
  type LeadStatusValue,
} from "@/lib/stateMachine";

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
  rejection_reason: string | null;
  hired_client: string | null;
  hired_position: string | null;
  interview_date: string | null;
  interview_notes: string | null;
  followup_notes: string | null;
  preferences: Record<string, unknown> | null;
}

function getStatusColor(status: string): string {
  const colors = SM_STATUS_COLORS[status as LeadStatusValue];
  if (colors) return `${colors.bg} ${colors.text}`;
  return "bg-gray-100 text-gray-800";
}

function getStatusLabel(status: string): string {
  return STATUS_LABELS[status as LeadStatusValue] ?? status;
}

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

function PencilIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" />
    </svg>
  );
}

export function LeadSheet({
  lead,
  onClose,
}: {
  lead: SheetLead | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);

  // Conversation sheet state
  const [convOpen, setConvOpen] = useState(false);
  const [convMode, setConvMode] = useState<"call" | "whatsapp">("call");

  // Edit dialog state
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editJobTitle, setEditJobTitle] = useState("");
  const [editLocation, setEditLocation] = useState("");
  const [editExperience, setEditExperience] = useState("");
  const [editAge, setEditAge] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  // Local display state (updates immediately on save)
  const [displayName, setDisplayName] = useState("");
  const [displayPhone, setDisplayPhone] = useState<string | null>(null);
  const [displayEmail, setDisplayEmail] = useState<string | null>(null);
  const [displayJobTitle, setDisplayJobTitle] = useState<string | null>(null);
  const [displayLocation, setDisplayLocation] = useState<string | null>(null);
  const [displayExperience, setDisplayExperience] = useState<string | null>(null);
  const [displayAge, setDisplayAge] = useState<number | null>(null);

  // Sync display state when lead changes
  useEffect(() => {
    if (!lead) return;
    setDisplayName(lead.name);
    setDisplayPhone(lead.phone);
    setDisplayEmail(lead.email);
    setDisplayJobTitle(lead.job_title);
    setDisplayLocation(lead.location);
    setDisplayExperience(lead.experience);
    setDisplayAge(lead.age);
  }, [lead]);

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

  const intlPhone = formatPhone(displayPhone);
  const statusColor = getStatusColor(lead.status);
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

  function openEditDialog() {
    setEditName(displayName);
    setEditPhone(displayPhone ?? "");
    setEditEmail(displayEmail ?? "");
    setEditJobTitle(displayJobTitle ?? "");
    setEditLocation(displayLocation ?? "");
    setEditExperience(displayExperience ?? "");
    setEditAge(displayAge?.toString() ?? "");
    setEditOpen(true);
  }

  async function handleSaveDetails() {
    if (!editName.trim()) {
      toast.error("שם הוא שדה חובה");
      return;
    }
    setSavingEdit(true);
    const result = await updateLeadDetails(lead!.id, {
      name: editName.trim(),
      phone: editPhone.trim(),
      email: editEmail.trim(),
      job_title: editJobTitle.trim(),
      location: editLocation.trim(),
      experience: editExperience.trim(),
      age: editAge.trim(),
    });
    setSavingEdit(false);
    if (result.error) {
      toast.error("שגיאה בעדכון הפרטים");
    } else {
      setDisplayName(editName.trim());
      setDisplayPhone(editPhone.trim() || null);
      setDisplayEmail(editEmail.trim() || null);
      setDisplayJobTitle(editJobTitle.trim() || null);
      setDisplayLocation(editLocation.trim() || null);
      setDisplayExperience(editExperience.trim() || null);
      const ageNum = editAge.trim() ? parseInt(editAge.trim(), 10) : null;
      setDisplayAge(ageNum && ageNum > 0 && ageNum < 120 ? ageNum : null);
      setEditOpen(false);
      toast.success("הפרטים עודכנו!");
      router.refresh();
    }
  }

  const matchedClient = (lead.preferences as Record<string, unknown>)?.matched_client as string | undefined;

  const fields = [
    { label: "טלפון", value: displayPhone, dir: "ltr" as const },
    { label: "אימייל", value: displayEmail, dir: "ltr" as const },
    { label: "מיקום", value: displayLocation },
    { label: "תפקיד", value: displayJobTitle },
    { label: "לקוח", value: matchedClient },
    { label: "ניסיון", value: displayExperience },
    { label: "גיל", value: displayAge?.toString() },
    { label: "תאריך", value: new Date(lead.created_at).toLocaleDateString("he-IL") },
  ];

  return (
    <Sheet open={true} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent side="left" className="w-full sm:max-w-md overflow-y-auto p-0">
        {/* Header */}
        <SheetHeader className="border-b px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-bold flex-shrink-0">
              {getInitials(displayName)}
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <SheetTitle className="text-lg">{displayName}</SheetTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={openEditDialog}
                  className="text-gray-400 hover:text-blue-600 hover:bg-blue-50 gap-1 h-7 px-2"
                  title="ערוך פרטים"
                >
                  <PencilIcon className="w-3.5 h-3.5" />
                  <span className="text-[11px]">עריכה</span>
                </Button>
              </div>
              <SheetDescription className="flex items-center gap-2 mt-1">
                <span className={"inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold " + statusColor}>
                  {getStatusLabel(lead.status)}
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
            <button
              type="button"
              onClick={() => {
                setConvMode("call");
                setConvOpen(true);
                setTimeout(() => {
                  const a = document.createElement("a");
                  a.href = "tel:" + lead.phone;
                  a.click();
                }, 300);
              }}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-blue-50 text-blue-700 text-sm font-medium hover:bg-blue-100 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
              </svg>
              התקשר
            </button>
            <button
              type="button"
              onClick={() => {
                setConvMode("whatsapp");
                setConvOpen(true);
                setTimeout(() => {
                  window.open("https://api.whatsapp.com/send?phone=" + intlPhone, "_blank", "noopener,noreferrer");
                }, 300);
              }}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-green-50 text-green-700 text-sm font-medium hover:bg-green-100 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z" />
              </svg>
              WhatsApp
            </button>
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

      {/* Edit Details Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>עריכת פרטי ליד</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="sheet-edit-name">שם מלא *</Label>
              <Input
                id="sheet-edit-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="שם מלא"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sheet-edit-phone">טלפון</Label>
              <Input
                id="sheet-edit-phone"
                value={editPhone}
                onChange={(e) => setEditPhone(e.target.value)}
                placeholder="050-1234567"
                dir="ltr"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sheet-edit-email">אימייל</Label>
              <Input
                id="sheet-edit-email"
                type="email"
                value={editEmail}
                onChange={(e) => setEditEmail(e.target.value)}
                placeholder="email@example.com"
                dir="ltr"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sheet-edit-job-title">תפקיד</Label>
              <Input
                id="sheet-edit-job-title"
                value={editJobTitle}
                onChange={(e) => setEditJobTitle(e.target.value)}
                placeholder="תפקיד נוכחי"
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2 space-y-2">
                <Label htmlFor="sheet-edit-location">מיקום</Label>
                <Input
                  id="sheet-edit-location"
                  value={editLocation}
                  onChange={(e) => setEditLocation(e.target.value)}
                  placeholder="עיר / אזור"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sheet-edit-age">גיל</Label>
                <Input
                  id="sheet-edit-age"
                  type="number"
                  min={1}
                  max={119}
                  value={editAge}
                  onChange={(e) => setEditAge(e.target.value)}
                  placeholder="גיל"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="sheet-edit-experience">ניסיון</Label>
              <Input
                id="sheet-edit-experience"
                value={editExperience}
                onChange={(e) => setEditExperience(e.target.value)}
                placeholder="שנות ניסיון / תיאור"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditOpen(false)}
              disabled={savingEdit}
            >
              ביטול
            </Button>
            <Button
              onClick={handleSaveDetails}
              disabled={savingEdit || !editName.trim()}
            >
              {savingEdit ? "שומר..." : "שמור שינויים"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Conversation Sheet */}
      <ConversationSheet
        open={convOpen}
        onOpenChange={setConvOpen}
        lead={lead as unknown as Lead}
        mode={convMode}
      />
    </Sheet>
  );
}
